# 分桶排行榜

!!! note "注意"
    如果你还没有阅读过[排行榜](../../concepts/leaderboards.md)文档，请先熟悉相关概念和功能。

随着游戏的玩家基数增长，在线游戏中出现了一种基本的社交互动问题。全球排行榜和一般的排行榜变得静态化，在任何特定的技能或得分水平上几乎没有变动。这导致新玩家的参与度减少或缺乏，从而对继续玩游戏失去兴趣。解决这个问题的一个方法是实现分桶排行榜。

在分桶排行榜中，玩家不是与所有其他玩家竞争，而是只能看到其他玩家的有限视图（通常是25-50个）。他们与这个小组的玩家竞争，直到排行榜过期或滚动到另一个开始时间。这些较小的玩家组被称为队列或"玩家桶"，这就是分桶排行榜名称的由来。

分桶排行榜可以在许多热门游戏中看到，包括Rovio的《愤怒的小鸟》系列中的几个标题。

使用Nakama的[存储引擎](../../concepts/collections.md)、[排行榜](../../concepts/leaderboards.md)和[锦标赛](../../concepts/tournaments.md)功能，你可以使用服务器运行时代码实现分桶排行榜。

Nakama的排行榜API已经允许你传入一组用户ID（或用户名），这些用户ID将成为用于生成仅包含这些玩家的"分桶视图"的过滤器。

这只剩下如何为特定玩家形成用户ID集合，以及它是否个性化或遵循其他游戏标准。这是成功实现的关键，取决于你的游戏的特定机制。你可能希望"视图"是类似排名的玩家、VIP玩家、用户的好友或同一地区的玩家。

在这个例子中，我们使用"随机"选择的用户作为特定玩家所看到的桶。我们首先介绍代码的关键部分，并在最后提供完整的文件供参考。

## 创建分桶排行榜

在这里，我们创建一个新的分桶排行榜，`分桶每周 #1`，每周都会重置。

=== "Go"
    ```go
    func InitModule(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, initializer runtime.Initializer) error {
        // 设置分桶排行榜比赛
        id := "bucketed_weekly"
        metadata := map[string]interface{}{}

        if err := nk.TournamentCreate(ctx, id, "desc", "incr", "0 0 * * 0", metadata,
            "分桶每周 #1", "", 1, 0, 0, 604800, 100000000, 10000000, false); err != nil {
            return err
        }
        if err := initializer.RegisterRpc("get_bucket_records", rpcGetBucketRecordsFn([]string{id}, 2000)); err != nil {
            return err
        }
        return nil
    }
    ```

## 生成用户分桶

每个玩家都会有一个独立的分桶 - 他们正在对战的对手集合 - 这个分桶是为他们创建的，并且是唯一的。首先，我们定义分桶存储对象：

=== "Go"
    ```go
    // 定义分桶排行榜存储对象
    type userBucketStorageObject struct {
        ResetTimeUnix uint32   `json:"resetTimeUnix"`
        UserIDs       []string `json:"userIds"`
    }
    ```

然后，我们定义一个 RPC 函数来获取玩家的 ID 并检查是否存在任何分桶。如果找到一个分桶，我们获取它，如果没有，我们创建一个新的分桶。最后，我们获取实际的排行榜。

=== "Go"
    ```go
    // 获取用户的分桶（记录）并在需要时生成新的分桶
    func RpcGetBucketRecordsFn(ids []string, bucketSize int) func(context.Context, runtime.Logger, *sql.DB, runtime.NakamaModule, string) (string, error) {
        return func(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
            if len(payload) > 0 {
                return "", ErrNoInputAllowed
            }

            userID, ok := ctx.Value(runtime.RUNTIME_CTX_USER_ID).(string)
            if !ok {
                return "", ErrNoUserIdFound
            }

```go
collection := "buckets"
key := "bucket"

objects, err := nk.StorageRead(ctx, []*runtime.StorageRead{
    {
        Collection: collection,
        Key:        key,
        UserID:     userID,
    },
})
if err != nil {
    logger.Error("nk.StorageRead 错误: %v", err)
    return "", ErrInternalError
}

// 获取现有的 bucket，如果不存在则创建一个
userBucket := &userBucketStorageObject{ResetTimeUnix: 0, UserIDs: []string{}}
if len(objects) > 0 {
    if err := json.Unmarshal([]byte(objects[0].GetValue()), userBucket); err != nil {
        logger.Error("json.Unmarshal 错误: %v", err)
        return "", ErrUnmarshal
    }
}

// 获取排行榜
leaderboards, err := nk.LeaderboardsGetId(ctx, ids)
if err != nil {
    logger.Error("nk.LeaderboardsGetId 错误: %v", err)
    return "", ErrInternalError
}
```

## 检查 bucket 状态

在继续之前，我们要检查排行榜是否已重置或是否没有对手。如果是这两种情况之一，我们需要生成一个新的对手集合。

=== "Go"
```go
// 排行榜已重置或用户没有当前的 bucket
if userBucket.ResetTimeUnix != leaderboards[0].GetPrevReset() || len(userBucket.UserIDs) < 1 {
    logger.Debug("rpcGetBucketRecordsFn 为 %q 创建新的 bucket", userID)
```

## 生成对手集合

为了生成随机的对手列表，我们将使用 Nakama 3.5.0 中提供的 `GetUsersRandom` 函数。

=== "Go"
```go
userBucket.UserIDs = nil
logger.Debug("rpcGetBucketRecordsFn 为 %q 创建新的 bucket", userID)

users, err := nk.UsersGetRandom(ctx, bucketSize)
if err != nil {
    logger.Error("获取随机用户时出错。")
    return "", ErrInternalError
}

for _, user := range users {
    userBucket.UserIDs = append(userBucket.UserIDs, user.Id)
}
```

!!! note "注意"
    如果您最终希望得到一个特定定义的对手列表（例如，仅限10-20级玩家），建议的方法是在数据库查询中（过度）扫描所需桶大小的因子，然后在应用层根据相关条件（玩家元数据）进行过滤。

## 编写新的桶

生成新的对手列表后，我们首先将桶重置时间和排行榜结束时间设置为相匹配。

=== "Go"
    ```go
    // 将重置时间和桶结束时间同步设置
    userBucket.ResetTimeUnix = leaderboards[0].GetNextReset()

    value, err := json.Marshal(userBucket)
    if err != nil {
        return "", ErrMarshal
    }

    // 为用户存储生成的桶
    if _, err := nk.StorageWrite(ctx, []*runtime.StorageWrite{
        {
            Collection:      collection,
            Key:             key,
            PermissionRead:  0,
            PermissionWrite: 0,
            UserID:          userID,
            Value:           string(value),
        },
    }); err != nil {
        logger.Error("nk.StorageWrite error: %v", err)
        return "", ErrInternalError
    }
    ```

最后，由于用户列表是伪随机生成的，用户本身可能会或可能不会包含在内，因此在列出记录之前，我们还需要将用户明确添加到分桶排行榜中。

=== "Go"
    ```go

    // 将自己添加到要获取的排行榜记录列表中
    userBucket.UserIDs = append(userBucket.UserIDs, userID)

    _, records, _, _, err := nk.LeaderboardRecordsList(ctx, ids[0], userBucket.UserIDs, bucketSize, "", 0)
    if err != nil {
        logger.Error("nk.LeaderboardRecordsList error: %v", err)
        return "", ErrInternalError
    }

    result := &api.LeaderboardRecordList{Records: records}
    encoded, err := json.Marshal(result)
    if err != nil {
        return "", ErrMarshal
    }
    ```

您可以使用[Nakama控制台](../../getting-started/console-overview.md)验证您的排行榜及其设置：

![分桶排行榜](bucket-nakama-console.png)

## 示例文件

下载完整的示例文件[bucketed_leaderboards.go](bucket.go)
