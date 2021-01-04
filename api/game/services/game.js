"use strict";

/**
 * Read the documentation (https://strapi.io/documentation/developer-docs/latest/concepts/services.html#core-services)
 * to customize this service
 */
const axios = require("axios");
const slugify = require("slugify");
const query = require("querystring");

function Exception(e) {
  return { e, data: e.data && e.data.errors && e.data.errors }; //retorna qualquer estrutura de errors possíveis vindos da Promisse
}

function timeout(ms) {
  //function necessário pois o envio das imagens demorava e antes de terminar já  tentava cadastrar outro jogo
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getGameInfo(slug) {
  try {
    const jsdom = require("jsdom");
    const { JSDOM } = jsdom;

    const body = await axios.get(`https://www.gog.com/game/${slug}`);
    const dom = new JSDOM(body.data);

    const description = dom.window.document.querySelector(".description");

    return {
      rating: "BR0",
      short_description: description.textContent.trim().slice(0, 160),
      description: description.innerHTML,
    };
  } catch (error) {
    console.log("getGameInfo", Exception(error));
  }
}

async function getByName(name, entityName) {
  const item = await strapi.services[entityName].find({ name });
  return item.length ? item[0] : null;
}

async function create(name, entityName) {
  const item = await getByName(name, entityName);

  if (!item) {
    return await strapi.services[entityName].create({
      name,
      slug: slugify(name, { strict: true, lower: true }),
    });
  }
}

async function createManyToManyData(products) {
  const developers = {};
  const publishers = {};
  const categories = {};
  const platforms = {};

  products.forEach((product) => {
    const { developer, publisher, genres, supportedOperatingSystems } = product;

    genres &&
      genres.forEach((item) => {
        categories[item] = true;
      });
    supportedOperatingSystems &&
      supportedOperatingSystems.forEach((item) => {
        platforms[item] = true;
      });
    developers[developer] = true;
    publishers[publisher] = true;
  });

  return Promise.all([
    ...Object.keys(developers).map((name) => create(name, "developer")),
    ...Object.keys(publishers).map((name) => create(name, "publisher")),
    ...Object.keys(categories).map((name) => create(name, "category")),
    ...Object.keys(platforms).map((name) => create(name, "platform")),
  ]);
}

async function setImage({ image, game, field = "cover" }) {
  try {
    const url = `https:${image}_bg_crop_1680x655.jpg`;
    const { data } = await axios.get(url, { responseType: "arraybuffer" });
    const buffer = Buffer.from(data, "base64"); //strapi não tem serviço específico para fazer upload de imagens então precisamos fazer como se fosse por dentro do strapi

    const FormData = require("form-data");
    const formData = new FormData();

    formData.append("refId", game.id);
    formData.append("ref", "game");
    formData.append("field", field);
    formData.append("files", buffer, { filename: `${game.slug}.jpg` });

    console.info(`Uploading ${field} Image: ${image.slug}.jpg`);

    await axios({
      method: "POST",
      url: `http://${strapi.config.host}:${strapi.config.port}/upload`,
      data: formData,
      headers: {
        "Content-Type": `multipart/form-data; boundary=${formData._boundary}`,
      },
    });
  } catch (error) {
    console.log("setImage", Exception(error));
  }
}

async function createGames(products) {
  await Promise.all(
    products.map(async (product) => {
      const item = await getByName(product.title, "game");

      if (!item) {
        console.info(`Creating: ${product.title}...`);
        const game = await strapi.services.game.create({
          name: product.title,
          slug: product.slug.replace(/_/g, "-"),
          price: product.price.amount,
          release_date: new Date(
            Number(product.globalReleaseDate) * 1000
          ).toISOString(), //it comes as a unix date then I need to convert it
          categories: await Promise.all(
            product.genres.map((name) => getByName(name, "category"))
          ),
          platforms: await Promise.all(
            product.supportedOperatingSystems.map((name) =>
              getByName(name, "platform")
            )
          ),
          developers: [await getByName(product.developer, "developer")],
          publisher: await getByName(product.publisher, "publisher"),
          ...(await getGameInfo(product.slug)), // destructuring passing slug to get description, rating and short_description
        });

        await setImage({ image: product.image, game });

        await Promise.all(
          product.gallery
            .slice(0, 5)
            .map((url) => setImage({ image: url, game, field: "gallery" }))
        );

        await timeout(2000);

        return game;
      }
    })
  );
}

module.exports = {
  populate: async (params) => {
    try {
      //console.log(params); //test to check if the params are there
      const gogApiUrl = `https://www.gog.com/games/ajax/filtered?mediaType=game&${query.stringfy(
        params
      )}`;

      const {
        data: { products },
      } = await axios.get(gogApiUrl);

      await createManyToManyData([products]);
      await createGames([products]);

      //await create(products[3].publisher, "publisher");
      //await create(products[3].developer, "developer");

      /* await strapi.services.publisher.create({
      name: products[0].publisher,
      slug: slugify(products[0].publisher).toLowerCase(),
    });
    await strapi.services.developer.create({
      name: products[0].developer,
      slug: slugify(products[0].developer).toLowerCase(),
    }); */

      //console.log(await getGameInfo(products[10].slug));
    } catch (error) {
      console.log("populate", Exception(error));
    }
  },
};
