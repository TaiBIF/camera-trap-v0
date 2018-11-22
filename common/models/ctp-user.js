const atob = require('atob');

const AWS_REGION = 'ap-northeast-1';
const USER_POOL_ID = 'ap-northeast-1_R2iDn5W3B';
const AWS_ID_PROVIDER = `cognito-idp.ap-northeast-1.amazonaws.com/${USER_POOL_ID}`;
const IDENTITY_POOL_ID = 'ap-northeast-1:3d5edbfb-834c-4284-85f5-a4ec29d38ef0';

module.exports = function(CtpUsers) {
  CtpUsers.remoteMethod('signIn', {
    http: { path: '/sign-in', verb: 'post' },
    // accepts: { arg: 'data', type: 'string', http: { source: 'body' } },
    accepts: [
      { arg: 'data', type: 'object', http: { source: 'body' } },
      { arg: 'req', type: 'object', http: { source: 'req' } },
    ],
    returns: { arg: 'ret', type: 'object' },
  });

  CtpUsers.signIn = function(data, req, callback) {
    console.log(data);
    console.log(req.http);

    const { idToken } = data;
    const AWS = CtpUsers.app.aws;
    const login = {};
    login[AWS_ID_PROVIDER] = idToken;

    AWS.config.update({ region: AWS_REGION });
    AWS.config.credentials = new AWS.CognitoIdentityCredentials({
      IdentityPoolId: IDENTITY_POOL_ID,
      Logins: login,
    });

    AWS.config.credentials.get(err => {
      if (err) {
        // console.log("Error", err);

        callback(err);
        throw err;
      } else {
        // 成功透過 OAuth 登入 AWS Cognito，取得 identity id

        const idT = AWS.config.credentials.params.Logins[AWS_ID_PROVIDER];
        const payload = idT.split('.')[1];
        const tokenobj = JSON.parse(atob(payload));
        const userID = tokenobj['cognito:username'];
        // let formatted = JSON.stringify(tokenobj, undefined, 2);
        // console.log(formatted);

        CtpUsers.getDataSource().connector.connect((_err, db) => {
          if (_err) {
            return callback(_err);
          }
          const dateTime = Date.now() / 1000;
          const mdl = db.collection('CtpUser');
          mdl.updateOne(
            { _id: userID },
            {
              $set: {
                modified: dateTime,
                idTokenHash: idT,
              },
              $setOnInsert: {
                _id: userID,
                userID,
                name: tokenobj.name,
                email: '',
                created: dateTime,
                project_roles: [
                  {
                    projectTitle: 'ANY_NEW_TITLE',
                    roles: ['ProjectInitiator'],
                  },
                ],
              },
            },
            {
              upsert: true,
            },
          );
        });

        const userInfo = {
          userID,
          identity_id: AWS.config.credentials.identityId,
          name: tokenobj.name,
          idToken: tokenobj,
        };

        req.session.user_info = userInfo;
        // let identity_id = AWS.config.credentials.identityId;
        console.log(req.session);
        console.log('Cognito Identity Id', userID);
        //* /
        callback(null, userID);
      }
    });
    //* /
  };

  CtpUsers.remoteMethod('whoAmI', {
    http: { path: '/me', verb: 'get' },
    // accepts: { arg: 'data', type: 'string', http: { source: 'body' } },
    accepts: [{ arg: 'req', type: 'object', http: { source: 'req' } }],
    returns: { arg: 'ret', type: 'object' },
  });

  CtpUsers.whoAmI = function(req, callback) {
    console.log(req.headers);

    let userId;
    try {
      // TODO: camera-trap-user-id 只在測試環境使用，正式環境要把這個 headers 拿掉
      userId =
        req.headers['camera-trap-user-id'] || req.session.user_info.user_id;
    } catch (e) {
      callback(new Error('使用者未登入'));
    }

    CtpUsers.getDataSource().connector.connect((err, db) => {
      if (err) {
        return callback(err);
      }

      const mdl = db.collection('CtpUser');
      mdl.findOne(
        { _id: userId },
        {
          projection: {
            idTokenHash: false,
            _id: false,
            id_token: false,
          },
        },
        (_err, result) => {
          if (_err) {
            return callback(_err);
          }
          return callback(null, result);
        },
      );
    });
  };
};
