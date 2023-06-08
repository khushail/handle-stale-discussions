import { ApolloClient, HttpLink, InMemoryCache, NormalizedCacheObject } from "@apollo/client/core";
import * as core from '@actions/core';
import fetch from 'cross-fetch';
import { DiscussionConnection } from "@octokit/graphql-schema";
import { GetDiscussionCountQuery, GetDiscussionCountQueryVariables, GetDiscussionCount, GetDiscussionDataQuery, GetDiscussionDataQueryVariables, GetDiscussionData, GetAnswerableDiscussionIdQuery, GetAnswerableDiscussionIdQueryVariables, GetAnswerableDiscussionId, GetLabelIdQuery, GetLabelId, CloseDiscussionAsResolvedMutation, CloseDiscussionAsResolved, CloseDiscussionAsOutdatedMutation, CloseDiscussionAsOutdated, AddDiscussionCommentMutation, AddDiscussionComment, MarkDiscussionCommentAsAnswerMutation, MarkDiscussionCommentAsAnswer, AddLabelToDiscussionMutation, AddLabelToDiscussion, UpdateDiscussionCommentMutation, UpdateDiscussionComment, ReactionContent, GetDiscussionCommentCountQuery, GetDiscussionCommentCount, GetCommentReactionCountQuery, GetCommentReactionCount, GetCommentReactionDataQuery, GetCommentReactionData, DiscussionCommentConnection, GetCommentMetaDataQuery, GetCommentMetaDataQueryVariables, GetCommentMetaData, DiscussionComment, TeamDiscussionCommentConnection, Discussion, GetLabelIdQueryVariables, CloseDiscussionAsResolvedMutationVariables, CloseDiscussionAsOutdatedMutationVariables, AddDiscussionCommentMutationVariables, MarkDiscussionCommentAsAnswerMutationVariables, AddLabelToDiscussionMutationVariables, UpdateDiscussionCommentMutationVariables, GetDiscussionCommentCountQueryVariables, GetCommentReactionCountQueryVariables, GetCommentReactionDataQueryVariables } from "./generated/graphql";

export class GithubDiscussionClient {
  private _githubClient: ApolloClient<NormalizedCacheObject>;
  private githubToken: string;
  private owner: string;
  private repo: string;
  private attentionLabelId: string;

  constructor(owner: string, repo: string) {
    this.owner = owner;
    this.repo = repo;
    const githubToken = core.getInput('github-token', { required: false }) || process.env.GITHUB_TOKEN;
    if (!githubToken) {
      throw new Error('You must provide a GitHub token as an input to this action, or as a `GITHUB_TOKEN` env variable. See the README for more info.');
    } else {
      this.githubToken = githubToken;
    }

    this.initializeAttentionLabelId();
  }

  get githubClient(): ApolloClient<NormalizedCacheObject> {
    if (!this._githubClient) {
      this._githubClient = new ApolloClient({
        link: new HttpLink({
          uri: "https://api.github.com/graphql",
          headers: {
            authorization: `token ${this.githubToken}`,
          },
          fetch
        }),
        cache: new InMemoryCache(),
      });
    }
    return this._githubClient;
  }

  async initializeAttentionLabelId() {
    if (!this.attentionLabelId) {
      const attentionLabel = core.getInput('attention-label', { required: false }) || 'attention';
      const result = await this.githubClient.query<GetLabelIdQuery, GetLabelIdQueryVariables>({
        query: GetLabelId,
        variables: {
          owner: this.owner,
          name: this.repo,
          labelName: attentionLabel
        }
      });

      if (!result.data.repository?.label?.id) {
        throw new Error(`Couldn't find mentioned Label!`);
      }

      this.attentionLabelId = result.data.repository?.label?.id;
      return this.attentionLabelId;
    } else {
      return this.attentionLabelId;
    }
  }

  async getTotalDiscussionCount(categoryID: string) {
    const resultCountObject = await this.githubClient.query<GetDiscussionCountQuery, GetDiscussionCountQueryVariables>({
      query: GetDiscussionCount,
      variables: {
        owner: this.owner,
        name: this.repo,
        categoryId: categoryID
      },
    });
    if (resultCountObject.error) {
      throw new Error("Error in reading discussions count");
    }

    core.debug(`Total discussion count : ${resultCountObject.data.repository?.discussions.totalCount}`);
    return resultCountObject.data.repository?.discussions.totalCount;
  }

  async getDiscussionsMetaData(categoryID: string): Promise<DiscussionConnection> {
    const discussionsCount = await this.getTotalDiscussionCount(categoryID);
    console.log("Total discussion count : " + discussionsCount);

    const result = await this.githubClient.query<GetDiscussionDataQuery, GetDiscussionDataQueryVariables>({
      query: GetDiscussionData,
      variables: {
        owner: this.owner,
        name: this.repo,
        categoryID: categoryID,
        count: discussionsCount!,
      },
    })

    if (result.error) { throw new Error("Error in retrieving all discussions metadata"); }

    return result.data.repository?.discussions as DiscussionConnection;
  }

  async getAnswerableDiscussionCategoryIDs(): Promise<any> {
    const answerableCategoryIDs: string[] = [];
    const result = await this.githubClient.query<GetAnswerableDiscussionIdQuery, GetAnswerableDiscussionIdQueryVariables>({
      query: GetAnswerableDiscussionId,
      variables: {
        owner: this.owner,
        name: this.repo
      },
    });

    if (!result.data.repository) {
      throw new Error(`Couldn't find repository id!`);
    }

    //iterate over discussion categories to get the id for answerable one
    result.data.repository.discussionCategories.edges?.forEach(element => {
      if (element?.node?.isAnswerable == true) {
        answerableCategoryIDs.push(element?.node?.id);
      }
    })

    if (answerableCategoryIDs.length === 0) {
      throw new Error("There are no Answerable category discussions in this repository");
    }

    return answerableCategoryIDs;
  }

  async closeDiscussionAsResolved(discussionId: string) {
    core.info("Closing discussion as resolved");
    const result = await this.githubClient.mutate<CloseDiscussionAsResolvedMutation, CloseDiscussionAsResolvedMutationVariables>({
      mutation: CloseDiscussionAsResolved,
      variables: {
        discussionId
      }
    });

    if (result.errors) {
      throw new Error("Error in retrieving result discussion id");
    }

    return result.data?.closeDiscussion?.discussion?.id;
  }

  async closeDiscussionAsOutdated(discussionId: string) {
    const result = await this.githubClient.mutate<CloseDiscussionAsOutdatedMutation, CloseDiscussionAsOutdatedMutationVariables>({
      mutation: CloseDiscussionAsOutdated,
      variables: {
        discussionId
      }
    });

    if (result.errors) {
      throw new Error("Error in closing outdated discussion");
    }

    return result.data?.closeDiscussion?.discussion?.id;
  }

  async addCommentToDiscussion(discussionId: string, body: string) {
    if (discussionId === "") {
      throw new Error(`Couldn't create comment as discussionId is null!`);
    }

    const result = await this.githubClient.mutate<AddDiscussionCommentMutation, AddDiscussionCommentMutationVariables>({
      mutation: AddDiscussionComment,
      variables: {
        discussionId,
        body,
      },
    });

    if (result.errors) {
      throw new Error("Mutation adding comment to discussion failed with error");
    }
  }

  async markDiscussionCommentAsAnswer(commentId: string) {
    const result = await this.githubClient.mutate<MarkDiscussionCommentAsAnswerMutation, MarkDiscussionCommentAsAnswerMutationVariables>({
      mutation: MarkDiscussionCommentAsAnswer,
      variables: {
        commentId
      }
    });

    if (result.errors) {
      throw new Error("Error in mutation of marking comment as answer, can not proceed");
    }

    return result;
  }

  async addAttentionLabelToDiscussion(discussionId: string) {
    if (discussionId === "") {
      throw new Error("Invalid discussion id, can not proceed!");
    }

    const result = await this.githubClient.mutate<AddLabelToDiscussionMutation, AddLabelToDiscussionMutationVariables>({
      mutation: AddLabelToDiscussion,
      variables: {
        labelableId: discussionId,
        labelIds: this.attentionLabelId,
      }
    });

    if (result.errors) {
      throw new Error("Error in mutation of adding label to discussion, can not proceed!");
    }

    return result;
  }

  async updateDiscussionComment(commentId: string, body: string) {
    const result = await this.githubClient.mutate<UpdateDiscussionCommentMutation, UpdateDiscussionCommentMutationVariables>({
      mutation: UpdateDiscussionComment,
      variables: {
        commentId,
        body
      }
    });

    if (result.errors) {
      throw new Error("Error in updating discussion comment");
    }

    return result;
  }

  async getDiscussionCommentCount(owner: string, name: string, discussionNum: number): Promise<any> {
    const result = await this.githubClient.query<GetDiscussionCommentCountQuery, GetDiscussionCommentCountQueryVariables>({
      query: GetDiscussionCommentCount,
      variables: {
        owner: this.owner,
        name: this.repo,
        num: discussionNum
      },
    });

    if (result.error)
      throw new Error("Error in retrieving comment count related to discussion!");

    return result.data.repository?.discussion?.comments.totalCount;
  }


  async getCommentReactionCount(owner: string, name: string, discussionNum: number, commentCount: number): Promise<any> {
    if (commentCount == 0)
    {
      core.info("Comments on the discussion does not exist!");
      return;
    }

    const result = await this.githubClient.query<GetCommentReactionCountQuery, GetCommentReactionCountQueryVariables>({
      query: GetCommentReactionCount,
      variables: {
        owner: this.owner,
        name: this.repo,
        discussionNumber: discussionNum,
        commentCount: commentCount
      },
    });

    if (result.error)
      throw new Error("Error in retrieving comment count related to discussion!");

    return result.data.repository?.discussion?.comments?.edges;
  }

  async getCommentReactionData(owner: string, name: string, discussionNum: number, commentCount: number, reactionCount: number): Promise<any> {
    if (reactionCount == 0)
    {
      core.info("No reactions posted on the comments!");
      return;
    }

    const result = await this.githubClient.query<GetCommentReactionDataQuery, GetCommentReactionDataQueryVariables>({
      query: GetCommentReactionData,
      variables: {
        owner: this.owner,
        name: this.repo,
        discussionNumber: discussionNum,
        commentCount: commentCount,
        reactionCount: reactionCount
      },
    });

    if (result.error)
      throw new Error("Error in retrieving reaction on comment!");

    return result.data.repository?.discussion?.comments.edges;
  }


  async getCommentsMetaData(discussionNum: number, commentCount: number): Promise<DiscussionCommentConnection> {
    const result = await this.githubClient.query<GetCommentMetaDataQuery, GetCommentMetaDataQueryVariables>({
      query: GetCommentMetaData,
      variables: {
        owner: this.owner,
        name: this.repo,
        discussionNumber: discussionNum,
        commentCount: commentCount,
      },
    })

    if (result.error) { throw new Error("Error in retrieving comment metadata"); }

    return result.data.repository?.discussion?.comments as DiscussionCommentConnection ;
  }
}
