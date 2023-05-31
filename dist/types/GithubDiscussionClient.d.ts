import { ApolloClient, NormalizedCacheObject } from "@apollo/client/core";
import { DiscussionConnection } from "@octokit/graphql-schema";
import { MarkDiscussionCommentAsAnswerMutation, AddLabelToDiscussionMutation, UpdateDiscussionCommentMutation } from "./generated/graphql";
export declare class GithubDiscussionClient {
    private _githubClient;
    private githubToken;
    private owner;
    private repo;
    private attentionLabelId;
    constructor(owner: string, repo: string);
    get githubClient(): ApolloClient<NormalizedCacheObject>;
    initializeAttentionLabelId(): Promise<string>;
    getTotalDiscussionCount(categoryID: string): Promise<number | undefined>;
    getDiscussionsMetaData(categoryID: string): Promise<DiscussionConnection>;
    getAnswerableDiscussionCategoryIDs(): Promise<any>;
    closeDiscussionAsResolved(discussionId: string): Promise<string | undefined>;
    closeDiscussionAsOutdated(discussionId: string): Promise<string | undefined>;
    addCommentToDiscussion(discussionId: string, body: string): Promise<void>;
    markDiscussionCommentAsAnswer(commentId: string): Promise<import("@apollo/client/core").FetchResult<MarkDiscussionCommentAsAnswerMutation>>;
    addAttentionLabelToDiscussion(discussionId: string): Promise<import("@apollo/client/core").FetchResult<AddLabelToDiscussionMutation>>;
    updateDiscussionComment(commentId: string, body: string): Promise<import("@apollo/client/core").FetchResult<UpdateDiscussionCommentMutation>>;
}
