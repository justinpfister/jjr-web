const config = require('../config');

/**
 * getLatestPhoto
 * Returns a minimal object { url, description } or null if unavailable.
 * This is a stub: when Google credentials are configured, replace with real API calls.
 */
async function getLatestPhoto() {
    const { clientId, clientSecret, refreshToken, albumId } = config.google;
    const hasCreds = clientId && clientSecret && refreshToken && albumId;
    if (!hasCreds) {
        return null;
    }

    // TODO: Integrate with Google Photos API using googleapis.
    // For now, return null to indicate no data until configured.
    return null;
}

module.exports = {
    getLatestPhoto
};

