const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { v4: uuidv4 } = require('uuid');

const localAppData = process.env.LOCALAPPDATA;
const bookmarksPath = path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Default', 'Bookmarks');
const yamlPath = path.join(__dirname, 'bookmarks.yaml');
const backupPath = path.join(__dirname, 'Bookmarks.bak');

function getWebkitTime() {
    // Chrome uses microsecond offset from Jan 1, 1601.
    // 11644473600000 is the number of milliseconds between 1601 and 1970
    return String((Date.now() + 11644473600000) * 1000);
}

function exportBookmarks() {
    if (!fs.existsSync(bookmarksPath)) {
        console.error('Bookmarks JSON file not found at:', bookmarksPath);
        process.exit(1);
    }

    const rawData = fs.readFileSync(bookmarksPath, 'utf8');
    const bookmarks = JSON.parse(rawData);
    const bookmarkBar = bookmarks.roots.bookmark_bar;

    function simplifyNode(node) {
        const simplified = {
            name: node.name,
        };
        if (node.type === 'url') {
            simplified.type = 'url';
            simplified.url = node.url;
        } else if (node.type === 'folder') {
            simplified.type = 'folder';
            if (node.children) {
                simplified.children = node.children.map(simplifyNode);
            } else {
                simplified.children = [];
            }
        }
        return simplified;
    }

    const simplifiedTree = {
        name: bookmarkBar.name,
        type: 'folder',
        children: bookmarkBar.children ? bookmarkBar.children.map(simplifyNode) : []
    };

    const yamlStr = yaml.dump(simplifiedTree, {
        indent: 2,
        lineWidth: -1 // Prevents wrapping long URLs
    });

    fs.writeFileSync(yamlPath, yamlStr, 'utf8');
    console.log(`Successfully exported Chrome Bookmarks to ${yamlPath}`);
    console.log('You can now edit this YAML file, and run "node index.js import" to apply changes.');
}

function importBookmarks() {
    if (!fs.existsSync(yamlPath)) {
        console.error('bookmarks.yaml not found. Please run export first or create it.');
        process.exit(1);
    }
    if (!fs.existsSync(bookmarksPath)) {
        console.error('Bookmarks JSON file not found at:', bookmarksPath);
        process.exit(1);
    }

    const rawYaml = fs.readFileSync(yamlPath, 'utf8');
    let importedTree;
    try {
        importedTree = yaml.load(rawYaml);
    } catch (e) {
        console.error('Failed to parse YAML:', e.message);
        process.exit(1);
    }

    const rawData = fs.readFileSync(bookmarksPath, 'utf8');
    
    // Create Backup
    fs.writeFileSync(backupPath, rawData, 'utf8');
    console.log(`Created backup at ${backupPath}`);

    const bookmarks = JSON.parse(rawData);

    // Build index of existing items to preserve IDs, GUIDs, and date_added
    const index = new Map();
    let maxId = 0;

    function buildIndexAndMaxId(node) {
        const idInt = parseInt(node.id, 10);
        if (!isNaN(idInt) && idInt > maxId) {
            maxId = idInt;
        }

        if (node.type === 'url') {
            index.set(`url:${node.url}|name:${node.name}`, node);
        } else if (node.type === 'folder') {
            index.set(`folder:${node.name}`, node);
        }

        if (node.children) {
            node.children.forEach(buildIndexAndMaxId);
        }
    }

    // Index all roots to ensure we find IDs properly
    ['bookmark_bar', 'other', 'synced'].forEach(rootKey => {
        if (bookmarks.roots[rootKey]) {
            buildIndexAndMaxId(bookmarks.roots[rootKey]);
        }
    });

    function rebuildNode(ymlNode) {
        let key = '';
        if (ymlNode.type === 'url') {
            key = `url:${ymlNode.url}|name:${ymlNode.name}`;
        } else {
            key = `folder:${ymlNode.name}`;
        }

        const existing = index.get(key);
        const node = {
            date_added: existing ? existing.date_added : getWebkitTime(),
            guid: existing ? existing.guid : uuidv4(),
            id: existing ? existing.id : String(++maxId),
            name: ymlNode.name,
            type: ymlNode.type || 'url'
        };

        if (node.type === 'url') {
            node.url = ymlNode.url;
            if (existing && existing.meta_info) {
                node.meta_info = existing.meta_info;
            }
        } else if (node.type === 'folder') {
            node.date_modified = existing ? existing.date_modified : getWebkitTime();
            node.children = ymlNode.children ? ymlNode.children.map(rebuildNode) : [];
            if (existing && existing.date_last_used) {
                node.date_last_used = existing.date_last_used;
            }
        }

        return node;
    }

    // Replace the children
    bookmarks.roots.bookmark_bar.children = importedTree.children ? importedTree.children.map(rebuildNode) : [];

    // Write back to Chrome Bookmarks
    fs.writeFileSync(bookmarksPath, JSON.stringify(bookmarks, null, 3), 'utf8');
    console.log('Successfully imported changes into Chrome Bookmarks.');
    console.log('IMPORTANT: Please ensure Chrome was completely closed before doing this. If it was open, restart Chrome to see changes, but Chrome might have overwritten your changes if it synced.');
}

const command = process.argv[2];

if (command === 'export') {
    exportBookmarks();
} else if (command === 'import') {
    importBookmarks();
} else {
    console.log('Usage:');
    console.log('  node index.js export   - Extract Chrome bookmark_bar to bookmarks.yaml');
    console.log('  node index.js import   - Merge bookmarks.yaml back to Chrome Bookmarks');
}
