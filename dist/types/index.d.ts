import * as octokit from '@octokit/graphql-schema';
import { GithubDiscussionClient } from "./GithubDiscussionClient";
export declare function processDiscussions(githubClient: GithubDiscussionClient): Promise<void>;
export declare function processComments(discussion: octokit.DiscussionEdge, githubClient: GithubDiscussionClient): Promise<void>;
