let InitModule: nkruntime.InitModule = function (ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, initializer: nkruntime.Initializer) {
  // Set up the bucketed leaderboards tournament
  const id = 'bucketed_weekly';
  const authoritative = true;
  const sortOrder = nkruntime.SortOrder.DESCENDING;
  const operator = nkruntime.Operator.INCREMENTAL;
  const duration = 604800;
  const resetSchedule = '0 0 * * 0';
  const metadata = {};
  const title = 'Bucketed Weekly #1';
  const description = '';
  const category = 1;
  const startTime = 0;
  const endTime = 0;
  const maxSize = 100000000;
  const maxNumScore = 10000000;
  const joinRequired = false;

  nk.tournamentCreate(id, authoritative, sortOrder, operator, duration, resetSchedule, metadata, title, description, category, startTime, endTime, maxSize, maxNumScore, joinRequired);
  initializer.registerRpc('get_bucket_records', RpcGetBucketRecordsFn([id], 2000));
}

// Define the bucketed leaderboard storage object
interface UserBucketStorageObject {
  resetTimeUnix: number,
  userIds: string[]
}

const RpcGetBucketRecordsFn = function (ids: string[], bucketSize: number) {
  return function(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string) {
    if (!payload) {
      throw new Error('no payload input allowed');
    }

    const collection = 'buckets';
    const key = 'bucket';

    const objects = nk.storageRead([
      {
        collection,
        key,
        userId: ctx.userId
      }
    ]);

    // Fetch any existing bucket or create one if none exist
    let userBucket: UserBucketStorageObject = { resetTimeUnix: 0, userIds: [] };

    if (objects.length > 0) {
      userBucket = objects[0].value as UserBucketStorageObject;
    }

    // Fetch the tournament leaderboard
    const leaderboards = nk.tournamentsGetId(ids);

    // Leaderboard has reset or no current bucket exists for user
    if (userBucket.resetTimeUnix != leaderboards[0].endActive || userBucket.userIds.length < 1) {
      logger.debug(`RpcGetBucketRecordsFn new bucket for ${ctx.userId}`);

      const users = nk.usersGetRandom(bucketSize);
      users.forEach(function (user: nkruntime.User) {
        userBucket.userIds.push(user.userId);
      });

      // Set the Reset and Bucket end times to be in sync
      userBucket.resetTimeUnix = leaderboards[0].endActive;

      // Store generated bucket for the user
      nk.storageWrite([{
        collection,
        key,
        userId: ctx.userId,
        value: userBucket,
        permissionRead: 0,
        permissionWrite: 0
      }]);
    }

    // Add self to the list of leaderboard records to fetch
    userBucket.userIds.push(ctx.userId);

    // Generate some dummy leaderboard scores for demo purposes only - you would npt have this in production
    const accounts = nk.accountsGetId(userBucket.userIds);
    accounts.forEach(function (account: nkruntime.Account) {
      const score = Math.floor(Math.random() * 10000);
      nk.tournamentRecordWrite(ids[0], account.user.userId, account.user.username, score);
    });

    // Get the leaderboard records
    const records = nk.tournamentRecordsList(ids[0], userBucket.userIds, bucketSize);

    const result = JSON.stringify(records);
    logger.debug(`RpcGetBucketRecordsFn resp: ${result}`);

    return JSON.stringify(records);
  };
}

// Reference InitModule to avoid it getting removed on build
!InitModule && InitModule.bind(null);