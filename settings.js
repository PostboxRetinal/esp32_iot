/**
 * Custom Node-RED Settings
 * Ciudad Inteligente Hotel - MySQL Integration
 * 
 * Credenciales se pasan via variable de entorno NODE_RED_CREDENTIAL_SECRET
 */

module.exports = {
    credentialSecret: false,

    editorTheme: {
        projects: {
            enabled: false
        }
    },

    logging: {
        console: {
            level: 'info'
        }
    },

    timezone: process.env.TZ || 'America/Bogota',

    nodeMessageBufferMaxLength: 1000
};
