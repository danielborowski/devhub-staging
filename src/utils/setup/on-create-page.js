const memoizerific = require('memoizerific');
const { getNestedValue } = require('../get-nested-value');
const { getMetadata } = require('../get-metadata');

const metadata = getMetadata();
let stitchClient;

const DEFAULT_FEATURED_HOME_SLUGS = [
    '/how-to/nextjs-building-modern-applications',
    '/how-to/python-starlette-stitch',
    '/how-to/graphql-support-atlas-stitch',
    '/quickstart/free-atlas-cluster',
];

const DEFAULT_FEATURED_LEARN_SLUGS = [
    '/quickstart/java-setup-crud-operations',
    '/how-to/golang-alexa-skills',
    '/how-to/polymorphic-pattern',
];

const requestStitch = async (functionName, ...args) =>
    stitchClient.callFunction(functionName, [metadata, ...args]);
const memoizedStitchRequest = memoizerific(10)(requestStitch);

const getAllArticles = memoizerific(1)(async () => {
    const documents = await memoizedStitchRequest('fetchDevhubMetadata', {});
    // Ignore bad data, including links to the home page as an "article"
    const filteredDocuments = documents.filter(d => {
        const route = getNestedValue(['query_fields', 'slug'], d);
        const title = getNestedValue(['query_fields', 'title'], d);
        const image = getNestedValue(['query_fields', 'atf-image'], d);
        return route !== '/' && !!title && !!image;
    });
    return filteredDocuments;
});

const findArticlesFromSlugs = (allArticles, articleSlugs) => {
    const result = [];
    articleSlugs.forEach((featuredSlug, i) => {
        const newArticle = allArticles.find(
            x => x.query_fields.slug === featuredSlug
        );
        if (newArticle) {
            result.push(newArticle);
        } else {
            // This article was not found. pick an existing article and add it instead.
            result.push(allArticles[i]);
        }
    });
    return result;
};

const getLearnPageFilters = async () => {
    const languages = {};
    const products = {};

    const allArticles = await getAllArticles();

    allArticles.forEach(a => {
        const languagesForArticle = a.query_fields.languages;
        const productsForArticle = a.query_fields.products;
        if (languagesForArticle) {
            languagesForArticle.forEach(l => {
                if (languages[l]) {
                    languages[l].count++;
                } else {
                    languages[l] = {
                        count: 1,
                        products: {},
                    };
                }
                if (productsForArticle) {
                    productsForArticle.forEach(p => {
                        languages[l].products[p]
                            ? languages[l].products[p]++
                            : (languages[l].products[p] = 1);
                    });
                }
            });
        }
        if (productsForArticle) {
            productsForArticle.forEach(p => {
                if (products[p]) {
                    products[p].count++;
                } else {
                    products[p] = {
                        count: 1,
                        languages: {},
                    };
                }
                if (languagesForArticle) {
                    languagesForArticle.forEach(l => {
                        products[p].languages[l]
                            ? products[p].languages[l]++
                            : (products[p].languages[l] = 1);
                    });
                }
            });
        }
    });
    return { languages, products };
};

const onCreatePage = async (
    page,
    actions,
    inheritedStitchClient,
    homeFeaturedArticles,
    learnFeaturedArticles
) => {
    const { createPage, deletePage } = actions;
    stitchClient = inheritedStitchClient;
    switch (page.path) {
        case '/learn/':
            const allArticles = await getAllArticles();
            const filters = await getLearnPageFilters(allArticles);
            const featuredLearnArticles = findArticlesFromSlugs(
                allArticles,
                learnFeaturedArticles || DEFAULT_FEATURED_LEARN_SLUGS
            );
            deletePage(page);
            createPage({
                ...page,
                context: {
                    ...page.context,
                    allArticles,
                    featuredArticles: featuredLearnArticles,
                    filters,
                },
            });
            break;
        case '/':
            const featuredHomeArticles = findArticlesFromSlugs(
                await getAllArticles(),
                homeFeaturedArticles || DEFAULT_FEATURED_HOME_SLUGS
            );
            deletePage(page);
            createPage({
                ...page,
                context: {
                    ...page.context,
                    featuredArticles: featuredHomeArticles,
                },
            });
            break;
        default:
            break;
    }
};

module.exports = { onCreatePage };
