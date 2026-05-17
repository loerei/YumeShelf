const fs = require('fs');
const path = require('path');
const { app } = require('electron'); // Mock or assume it's available in main process

class SaveMappingManager {
    constructor(gameId) {
        this.gameId = gameId;
        this.mappingDir = path.join(app.getPath('userData'), 'save-mappings');
        this.mappingPath = path.join(this.mappingDir, `${this.gameId}.json`);
        this.load();
    }

    load() {
        if (!fs.existsSync(this.mappingDir)) {
            fs.mkdirSync(this.mappingDir, { recursive: true });
        }
        if (fs.existsSync(this.mappingPath)) {
            this.mappings = JSON.parse(fs.readFileSync(this.mappingPath, 'utf8'));
        } else {
            this.mappings = { variables: [] };
        }
    }

    save() {
        fs.writeFileSync(this.mappingPath, JSON.stringify(this.mappings, null, 2));
    }

    addMapping(name, offset, dataType = 'int32') {
        this.mappings.variables.push({ name, offset, dataType });
        this.save();
    }
}

module.exports = SaveMappingManager;
