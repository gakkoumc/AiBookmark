document.addEventListener('DOMContentLoaded', () => {
    const exportBtn = document.getElementById('exportBtn');
    const importBtn = document.getElementById('importBtn');
    const yamlEditor = document.getElementById('yamlEditor');
    const statusMessage = document.getElementById('statusMessage');

    // Utility to show messages
    function showMessage(msg, isError = false) {
        statusMessage.textContent = msg;
        statusMessage.className = 'status-message';
        statusMessage.classList.add(isError ? 'error' : 'success');
        statusMessage.classList.remove('hidden');
        setTimeout(() => {
            statusMessage.classList.add('hidden');
        }, 4000);
    }

    // Find the bookmark bar id (usually '1' but searching by name or assuming first sensible child of root is safer)
    // According to Chrome API, '1' is the Bookmarks Bar.
    const BOOKMARKS_BAR_ID = '1';

    // -------------------------
    // EXPORT LOGIC
    // -------------------------
    exportBtn.addEventListener('click', async () => {
        try {
            const tree = await chrome.bookmarks.getSubTree(BOOKMARKS_BAR_ID);
            if (!tree || tree.length === 0) {
                throw new Error("Bookmark bar not found.");
            }

            const bookmarkBar = tree[0];

            function simplifyNode(node) {
                const simplified = { name: node.title };
                if (node.url) {
                    simplified.type = 'url';
                    simplified.url = node.url;
                } else {
                    simplified.type = 'folder';
                    simplified.children = node.children ? node.children.map(simplifyNode) : [];
                }
                return simplified;
            }

            const simplifiedTree = {
                name: bookmarkBar.title,
                type: 'folder',
                children: bookmarkBar.children ? bookmarkBar.children.map(simplifyNode) : []
            };

            const yamlStr = jsyaml.dump(simplifiedTree, {
                indent: 2,
                lineWidth: -1 // Prevents wrapping long URLs
            });

            yamlEditor.value = yamlStr;
            showMessage('Successfully Exported to YAML!');
        } catch (e) {
            console.error(e);
            showMessage(`Export Error: ${e.message}`, true);
        }
    });

    // -------------------------
    // IMPORT LOGIC
    // -------------------------
    importBtn.addEventListener('click', async () => {
        const yamlStr = yamlEditor.value.trim();
        if (!yamlStr) {
            showMessage('YAML text is empty.', true);
            return;
        }

        let parsedYaml;
        try {
            parsedYaml = jsyaml.load(yamlStr);
        } catch (e) {
            console.error(e);
            showMessage(`YAML Parse Error: ${e.message}`, true);
            return;
        }

        if (!parsedYaml || !parsedYaml.children || !Array.isArray(parsedYaml.children)) {
            showMessage('YAML format is invalid. Needs "children" array at root.', true);
            return;
        }

        try {
            // 1. Get current tree
            const currentTree = await chrome.bookmarks.getSubTree(BOOKMARKS_BAR_ID);
            const currentChildren = currentTree[0].children || [];

            // Build an index of existing nodes to preserve ID where possible
            const index = new Map();

            function buildIndex(node) {
                if (node.url) {
                    index.set(`url:${node.url}|name:${node.title}`, node);
                } else {
                    index.set(`folder:${node.title}`, node);
                }
                if (node.children) {
                    node.children.forEach(buildIndex);
                }
            }
            currentChildren.forEach(buildIndex);

            // 2. We will clear the root and rebuild it. 
            // A more robust approach updates in place, but that is extremely complex with reordering.
            // To preserve chrome IDs, we ideally only `move` existing, `create` new, `remove` deleted.
            // 
            // Our Strategy:
            // - Iterate the new YAML flat structure to find what exists vs what is new.
            // - Unfortunately chrome.bookmarks API moving items around cleanly while recreating folders is hard.
            // - The safest way in Chrome Extensions to "replace" the tree is doing removeTree on old children, 
            //   and create for all. However that loses the internal IDs.
            // Let's implement smart syncing.

            showMessage('Importing...', false);

            // Keep track of visited existing IDs so we can delete the orphans
            const visitedIds = new Set();

            async function syncNodes(yamlNodes, parentId) {
                let indexInParent = 0;
                for (let i = 0; i < yamlNodes.length; i++) {
                    const yNode = yamlNodes[i];
                    const isUrl = yNode.type === 'url' || !!yNode.url;
                    const key = isUrl ? `url:${yNode.url}|name:${yNode.name}` : `folder:${yNode.name}`;
                    const existing = index.get(key);

                    let nodeId;

                    if (existing) {
                        nodeId = existing.id;
                        visitedIds.add(nodeId);

                        // Move to the correct relative position if needed
                        // Important: We must await this to ensure order is preserved
                        try {
                            await chrome.bookmarks.move(nodeId, { parentId: parentId, index: indexInParent });
                        } catch (err) {
                            console.warn("Failed to move node", yNode.name, err);
                        }

                        if (existing.title !== yNode.name || (isUrl && existing.url !== yNode.url)) {
                            try {
                                await chrome.bookmarks.update(nodeId, { title: yNode.name, url: yNode.url });
                            } catch (err) {
                                console.warn("Failed to update node", yNode.name, err);
                            }
                        }
                    } else {
                        // Create new
                        try {
                            const created = await chrome.bookmarks.create({
                                parentId: parentId,
                                index: indexInParent,
                                title: yNode.name,
                                url: isUrl ? yNode.url : undefined
                            });
                            nodeId = created.id;
                            // Add to visited so we don't accidentally remove it if we added it to index?
                            // It's not in index, so it won't be removed, but good practice
                            visitedIds.add(nodeId);
                        } catch (err) {
                            console.warn("Failed to create node", yNode.name, err);
                            // Skip processing children if folder creation failed
                            continue;
                        }
                    }

                    // Recurse for children
                    if (!isUrl && yNode.children && Array.isArray(yNode.children)) {
                        await syncNodes(yNode.children, nodeId);
                    }

                    indexInParent++;
                }
            }

            await syncNodes(parsedYaml.children, BOOKMARKS_BAR_ID);

            // 3. Remove orphans (nodes that were in Chrome but not in the YAML)
            for (const [key, node] of index.entries()) {
                if (!visitedIds.has(node.id)) {
                    console.log("Removing orphan:", node.title);
                    try {
                        await chrome.bookmarks.removeTree(node.id);
                    } catch (err) {
                        console.warn("Failed to remove orphan, might be already gone:", err);
                    }
                }
            }

            showMessage('Import Successful! Check your bookmarks bar.');

        } catch (e) {
            console.error(e);
            showMessage(`Import Error: ${e.message}`, true);
        }
    });
});
