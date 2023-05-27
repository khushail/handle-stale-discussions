import { DiscussionCommentConnection, DiscussionConnection } from '@octokit/graphql-schema';
import { GithubDiscussionClient } from "./GithubDiscussionClient";
export declare function processDiscussions(discussions: DiscussionConnection, githubClient: GithubDiscussionClient): Promise<void>;
export declare function processComments(comments: DiscussionCommentConnection, author: string, discussionId: string, githubClient: GithubDiscussionClient): Promise<void>;
