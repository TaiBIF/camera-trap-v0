// let strFunc = {};
// strFunc['uuid'] = require('uuid'); // 看起來 default 就是 v4
// let lb = require('loopback');

module.exports = function(Model, options) {
  'use strict';
  // console.log(Model.definition.rawProperties);

  let permissionDenied = function (message) {
    let PermissionDeniedErr = new Error();
    PermissionDeniedErr.message = "Permission denied.";

    if (!!message) {
      PermissionDeniedErr.message = PermissionDeniedErr.message + ": " + message;
    }
    return PermissionDeniedErr;
  }
  
  let checkPermissions = function(context, user, next) {

    // Check login status, using
    // express-session + connect-redis combo middleware.
    // Sessions and cookies are handled automatically
    // console.log(context.req.session.user_info);

    let user_info = context.req.session.user_info;
    let permission_denied_messages = [];

    if (user_info) {

      // 成功從 session 中取得登入資訊
      let user_id = user_info.user_id;

      console.log("User Id", user_id);

      Model.getDataSource().connector.connect(function(err, db) {

        if (err) { next(err); return; }

        let targetModelName = Model.definition.name;
        let remoteMethodName = context.methodString.split(".").pop();
        let CtpUsers = db.collection("CtpUsers");

        // 所有 remoteMethod 前都需要依據 remoteMethod, user id, target model, project name 檢查權限
        CtpUsers.aggregate(
          [
            { '$match': { _id: user_id } },
            {'$unwind': '$project_roles'},
            {'$unwind': '$project_roles.roles'},
            {
              '$lookup': {
                from: "RolePermissions",
                localField: "project_roles.roles",
                foreignField: "role",
                as: "role_details"
              }
            },
            {'$unwind': {
              path: '$role_details',
              preserveNullAndEmptyArrays: true
            }},
            {'$unwind': {
              path: '$role_details.permissions',
              preserveNullAndEmptyArrays: true
            }},
            {
              '$project': {
                user_id: '$user_id',
                name: '$name',
                project: '$project_roles.project',
                role: '$role_details.role',
                permissions: '$role_details.permissions',
                enabled: '$role_details.enabled'
              }
            },
            {
              '$match': {
                '$and': [
                  {
                    '$or': [
                      {'permissions.remoteMethod': "ANY"},
                      {'permissions.remoteMethod': remoteMethodName}
                    ]
                  },
                  {
                    '$or': [
                      {'permissions.collection': "ANY"},
                      {'permissions.collection': targetModelName}
                    ]
                  },
                  {'permissions.project': {"$ne" : "NA"}},
                  {'enabled': true}
                ]
              }
            }
            //*/
          ], {}, function(err, results){
            if (err) {
              next(err);
            }
            else {
              results.toArray(function(err, userPermissions) {
                if (err) { next(err); return;}
                else {
                  console.log(JSON.stringify(userPermissions, null, 2));
                  if (!userPermissions.length) { next(permissionDenied("You are a stranger.")); return; }

                  let projectValidated;
                  if (Model.definition.rawProperties.hasOwnProperty('project')) {
                    projectValidated = true;
                    // 先檢查使用者有無權限鎖計畫範疇資料
                    context.args.data.forEach(function(q){ // q for query
                      let permission_granted = false;
                      userPermissions.forEach(function(p){ // p for permission
                        if (q.project === p.project || p.permissions.project === 'ANY') {
                          permission_granted = true;
                        }
                      });
                      projectValidated = projectValidated && permission_granted; 
                    });
                  }
                  else { // no need to validate project
                    projectValidated = true;
                  }
                  console.log(projectValidated);

                  if (projectValidated) {
                    switch (targetModelName) {
                      case "LocationDataLock":
                        let mdl = db.collection(targetModelName);

                        // 再檢查資料是否已被他人鎖定
                        let go = true;
                        let go_counter = context.args.data.length;
                        
                        context.args.data.forEach(function(q){ // q for query
                          // 強制寫入 locked by
                          q.locked_by = user_id;
                          // 雖然是 toArray 但這個 query 只會回傳單一結果
                          mdl.find({_id: q.full_location_md5}).toArray(function(err, dataLock) {
                            console.log([user_id, dataLock]);
                            go_counter = go_counter - 1;

                            if (
                              (dataLock.length === 0) ||
                              (dataLock[0].locked && (q.locked_by === dataLock[0].locked_by) && (q.project === dataLock[0].project)) ||
                              (!dataLock[0].locked && (q.project === dataLock[0].project))
                            ) {
                              // 如果 dataLock 不存在，或
                              // 資料處於鎖定狀態，鎖定者與使用者是同一個人，且未更動計畫名稱或
                              // 資料未鎖定，任何人皆可在未更動計畫名稱
                              // 等前提下，鎖定或解鎖資料
                            }
                            else {
                              console.log("Don't go!");
                              permission_denied_messages.push(q.full_location_md5);
                              go = false;
                            }

                            if (go_counter === 0) {
                              if (go) {
                                next();
                              }
                              else {
                                if (err) {
                                  next(err);
                                }
                                else {
                                  next(permissionDenied(permission_denied_messages.join(",")));
                                }
                              }
                            }
                          });
                        });
                        break; // end of LocationDataLock logic
                      case "MultimediaAnnotations":
                        /* 
                        寫入 multimedia annotaiton/medatata 前尚需檢查 location lock 的問題
                        TODO: location 應該已上鎖 by user
                        1. 檢查待寫入的資料包括哪些 location, 但如何得知? => TODO: 每筆待更新資料內含 location 資訊
                        2. 檢查資料鎖定表, query location with user id (完全成立才放行) 
                        //*/

                        next();
                        break;
                      default:
                        next();
                        break;
                    }
                  }
                  else { // projectValidated is false
                    next(permissionDenied("Invalid project."));
                  }
                }
              }); // end of results.forEach (function (userPermissions) {})
            } // collection.aggregate without error
          });

      });

    } // end of if session exists
    else {
      next(permissionDenied("Session does not work."));
    }
  }

  // Model.beforeRemote("bulk*", checkPermissions);
  Model.beforeRemote("bulkReplace", checkPermissions);
  
}

