const tap = require('tap');
const test = require('tap-only');
const fs = require('fs');
const Expect = require('expect');
const db = require('../lib/db');
const { op, setup, teardown, _request: request } = require('./utils');
let user = null;

test('load user', t => {
  return db.sync().then(() => {
    return setup({}).then(u => (user = u)).then(() => t.pass('user loaded'));
  });
});

// reset the user store
// tap.afterEach(done => {
// user.save().then(() => done());
// });

tap.tearDown(teardown);

const dir = __dirname + '/operations/';
const tests = fs
  .readdirSync(dir)
  .filter(_ => {
    if (process.env.TEST) {
      // support for testing a single op
      return _.includes(process.env.TEST);
    }
    return true;
  })
  .reduce((acc, file) => {
    const [id] = file.split('.');
    acc[id] = op(dir + file);
    return acc;
  }, {});

Object.keys(tests).forEach(id => {
  test(tests[id].name || `issue #${id}`, t => {
    // user.store = tests[id].setup;

    const expect = tests[id].expect;
    const include = tests[id].include;
    const tokens = {
      token: user.apikey,
      // bearer: user.generateBearer(),
    };

    const requests = tests[id].op.reduce((acc, op) => {
      if (op.headers.authorization) {
        const [scheme] = op.headers.authorization.split(' ');
        op.headers.authorization = scheme + ' ' + tokens[scheme];
      }

      return acc.then(() =>
        request({
          url: op.url,
          headers: op.headers,
          method: op.method,
          body: op.body,
        }).then(res => {
          t.ok(
            res.statusCode < 300,
            `${op.method} ${op.url}: ${res.statusCode}`
          );
          if (res.statusCode === 500) {
            t.fail(res.body);
          }
          return res;
        })
      );
    }, Promise.resolve());

    return requests
      .then(res => {
        if (res.req.method === 'GET') {
          if (res.headers['content-type'].includes('application/json')) {
            return JSON.parse(res.body);
          }
          return res.body;
        }
        return t.fail('Only GET currently supported');
      })
      .then(store => {
        if (include) {
          t.ok(
            Expect(store).toInclude(include),
            `response includes: ${JSON.stringify(include)}`
          );
        } else {
          t.deepEqual(
            expect,
            store,
            `expected response matches: ${JSON.stringify(store)}`
          );
        }
      });
  });
});
