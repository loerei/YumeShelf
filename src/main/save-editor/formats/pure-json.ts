// @ts-nocheck
class PureJsonFormat {
    match(fileName) {
        return fileName.toLowerCase().endsWith('.json');
    }

    async decode(rawData) {
        const str = rawData.toString('utf8');
        try {
            const data = JSON.parse(str);
            if (data && typeof data === 'object') {
                data.$type = 'PureJsonSave';
            }
            return data;
        } catch (err) {
            console.error('[SAVE-EDITOR-JSON] Failed to parse JSON:', err);
            throw err;
        }
    }

    async encode(jsonData) {
        const cleanData = { ...jsonData };
        delete cleanData.$type;
        delete cleanData._userMappings;
        
        const outputStr = JSON.stringify(cleanData);
        return Buffer.from(outputStr, 'utf8');
    }

    async metadata(jsonData) {
        return {
            variables: [],
            switches: [],
            items: {},
            weapons: {},
            armors: {},
            gameTitle: 'JSON Save File'
        };
    }
}

module.exports = new PureJsonFormat();
