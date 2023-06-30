import { ApolloClient, NormalizedCacheObject } from "@apollo/client/core";
import { DiscussionConnection } from "@octokit/graphql-schema";
import { DiscussionCommentConnection } from "./generated/graphql";
export declare class GithubDiscussionClient {
    private _githubClient;
    private githubToken;
    private owner;
    private repo;
    private attentionLabelId;
    constructor();
    get githubClient(): ApolloClient<NormalizedCacheObject>;
    initializeAttentionLabelId(): Promise<void>;
    getTotalDiscussionCount(categoryID: string): Promise<number>;
    getDiscussionCommentCount(discussionNum: number): Promise<number>;
    getCommentsMetaData(discussionNum: number, commentCount: number): Promise<DiscussionCommentConnection>;
    getDiscussionsMetaData(categoryID: string, pageSize: number, afterCursor: string): Promise<DiscussionConnection>;
    getAnswerableDiscussionCategoryIDs(): Promise<any>;
    closeDiscussionAsResolved(discussionId: string): Promise<void>;
    closeDiscussionAsOutdated(discussionId: string): Promise<void>;
    addCommentToDiscussion(discussionId: string, body: string): Promise<void>;
    addInstructionTextReply(body: string, discussionId: string, replyToId: string): Promise<void>;
    markDiscussionCommentAsAnswer(commentId: string): Promise<void>;
    addAttentionLabelToDiscussion(discussionId: string): Promise<void>;
    updateDiscussionComment(commentId: string, body: string): Promise<void>;
}
