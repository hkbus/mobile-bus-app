// Source: https://github.com/mmomtchev/expo-android-localized-app-name/pull/3
// `expo-android-localized-app-name` at the moment does not support `zh-Hant` locale and that repo is not maintained anymore
const fs = require('fs');
const path = require('path');
const { withStringsXml, AndroidConfig } = require('@expo/config-plugins');
const xml2js = require('xml2js');
const builder = new xml2js.Builder({ headless: true });

function withAndroidLocalizedName(config) {
    return withStringsXml(config,
        async config => {
            const projectRoot = config.modRequest.projectRoot;
            const resPath = await AndroidConfig.Paths.getResourceFolderAsync(projectRoot);
            for (const locale of Object.keys(config.locales ?? {})) {
                const json = await fs.promises.readFile(config.locales[locale]);
                const strings = JSON.parse(json);
                const resources = [];
                for (const key of Object.keys(strings)) {
                    // Skip values that are not marked for translation or simply do not exist
                    // because gradle does not like them
                    const untranslated = config.modResults.resources.string?.find(item =>
                        item.$.name === key && item.$.translatable !== false);
                    if (untranslated)
                        resources.push({ string: { $: { name: key }, _: strings[key] } });
                }
                if (resources.length) {
                    let finalLocale = locale;
                    if (finalLocale.includes("-")) {
                        finalLocale = `b+${finalLocale.replaceAll("-", "+")}`;
                    }
                    await fs.promises.mkdir(path.resolve(resPath, `values-${finalLocale}`), {
                        recursive: true,
                    });
                    await fs.promises.writeFile(
                        path.resolve(resPath, `values-${finalLocale}`, 'strings.xml'),
                        builder.buildObject({ resources })
                    );
                }
            }
            return config;
        },
    );
};

module.exports = withAndroidLocalizedName;