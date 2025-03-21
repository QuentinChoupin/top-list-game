const express = require('express');
const bodyParser = require('body-parser');
const { Op } = require('sequelize');
const db = require('./models');

const app = express();

app.use(bodyParser.json());
app.use(express.static(`${__dirname}/static`));

app.get('/api/games', (req, res) => db.Game.findAll()
  .then((games) => res.send(games))
  .catch((err) => {
    console.log('There was an error querying games', JSON.stringify(err));
    return res.send(err);
  }));

app.post('/api/games', (req, res) => {
  const { publisherId, name, platform, storeId, bundleId, appVersion, isPublished } = req.body;
  return createrGame({ publisherId, name, platform, storeId, bundleId, appVersion, isPublished })
});

// /** @todo check arguments sent and data inside and should have pagination */
app.post('/api/games/search', (req, res) => {
  const { name, platform } = req.body;
  const queryParams = {
    ...(name && {
      name: {
        [Op.like]: `%${name}%`,
      },
    }
    ),
    ...(platform && {
      platform: {
        [Op.like]: `%${platform}%`,
      },
    }),
  };
  return db.Game.findAll({
    where: queryParams,
  }).then((games) => {
    return res.send(games);
  })
    .catch((err) => {
      console.log('***No game was found', JSON.stringify(err));
      res.status(404).send(err);
    });
});

// The request will block certain amount of time and this is not recommended.
// This is not optimized at all
app.post('/api/games/populate', async (req, res) => {
  // Harcoded strings are not recommended -> Should've been in an env or config file.
  const android_game_list_url = 'https://interview-marketing-eng-dev.s3.eu-west-1.amazonaws.com/android.top100.json';
  const ios_game_list_url = 'https://interview-marketing-eng-dev.s3.eu-west-1.amazonaws.com/ios.top100.json';
  const [android_game_list, ios_game_list] = await Promise.all([
    fetchGameData(android_game_list_url),
    fetchGameData(ios_game_list_url)
  ])
  const global_game_list = android_game_list.concat(ios_game_list)
  let mapped_game_list = []
  for (const games of global_game_list) {
    const mapped_games = mapGameData(games)
    mapped_game_list.push(...mapped_games)
  }
  await db.Game.bulkCreate(mapped_game_list)
  return res.status(200)
});

app.delete('/api/games/:id', (req, res) => {
  // eslint-disable-next-line radix
  const id = parseInt(req.params.id);
  return db.Game.findByPk(id)
    .then((game) => game.destroy({ force: true }))
    .then(() => res.send({ id }))
    .catch((err) => {
      console.log('***Error deleting game', JSON.stringify(err));
      res.status(400).send(err);
    });
});

app.put('/api/games/:id', (req, res) => {
  // eslint-disable-next-line radix
  const id = parseInt(req.params.id);
  return db.Game.findByPk(id)
    .then((game) => {
      const { publisherId, name, platform, storeId, bundleId, appVersion, isPublished } = req.body;
      return game.update({ publisherId, name, platform, storeId, bundleId, appVersion, isPublished })
        .then(() => res.send(game))
        .catch((err) => {
          console.log('***Error updating game', JSON.stringify(err));
          res.status(400).send(err);
        });
    });
});

app.listen(3000, () => {
  console.log('Server is up on port 3000');
});

/**
 *  This section should have been in another file
 *  Should have been a readStream instead of fetching all the file
 *  What if the file is very big ?
*/
async function fetchGameData(url) {
  try {
    const fetched_data = await fetch(url)
    return fetched_data.json()
  } catch (err) {
    console.err('*** Error when fetching url=%s ***', url)
    throw new Error('fetch-url-error')
  }
}

function mapGameData(game_list) {
  return game_list.map(game => ({
      publisherId: game.publisher_id?.toString(),
      name: game.name,
      platform: game.os,
      storeId: game.app_id,
      bundleId: game.bundle_id,
      appVersion: game.version,
      isPublished: new Date(game.release_date).getTime() < new Date().getTime()
    }
  ))
}

module.exports = app;
