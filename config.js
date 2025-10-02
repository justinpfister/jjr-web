require('dotenv').config();

function parseBoolean(value, defaultValue) {
    if (value === undefined) return defaultValue;
    const normalized = String(value).toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

module.exports = {
    port: Number(process.env.PORT || 3000),
    google: {
        albumId: process.env.GOOGLE_PHOTOS_ALBUM_ID || '',
        peopleFilter: process.env.GOOGLE_PEOPLE_FILTER || '', // e.g., "Justin Pfister,jjr,dad"
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
        refreshToken: process.env.GOOGLE_REFRESH_TOKEN || ''
    },
    devMode: parseBoolean(process.env.DEV_MODE, true)
};

