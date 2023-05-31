import { ApolloClient, HttpLink, InMemoryCache, NormalizedCacheObject } from "@apollo/client/core";
import * as core from '@actions/core';
import fetch from 'cross-fetch';
import { DiscussionConnection } from "@octokit/graphql-schema";
import { GetDiscussionCountQuery, GetDiscussionCountQueryVariables, GetDiscussionCount, GetDiscussionDataQuery, GetDiscussionDataQueryVariables, GetDiscussionData, GetAnswerableDiscussionIdQuery, GetAnswerableDiscussionIdQueryVariables, GetAnswerableDiscussionId, GetLabelIdQuery, GetLabelId, CloseDiscussionAsResolvedMutation, CloseDiscussionAsResolved, CloseDiscussionAsOutdatedMutation, CloseDiscussionAsOutdated, AddDiscussionCommentMutation, AddDiscussionComment, MarkDiscussionCommentAsAnswerMutation, MarkDiscussionCommentAsAnswer, AddLabelToDiscussionMutation, AddLabelToDiscussion, UpdateDiscussionCommentMutation, UpdateDiscussionComment, ReactionContent } from "./generated/graphql";

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
      const result = await this.githubClient.query<GetLabelIdQuery>({
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
  
    const discussions = await this.githubClient.query<GetDiscussionDataQuery, GetDiscussionDataQueryVariables>({
      query: GetDiscussionData,
      variables: {
        owner: this.owner,
        name: this.repo,
        categoryID: categoryID,
        count: discussionsCount,
      },
    })
  
    if (discussions.error) { throw new Error("Error in retrieving discussions metadata"); }
  
    //iterate over each discussion to process body text/comments/reactions
    return discussions.data.repository?.discussions as DiscussionConnection;
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
    const result = await this.githubClient.mutate<CloseDiscussionAsResolvedMutation>({
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
    const result = await this.githubClient.mutate<CloseDiscussionAsOutdatedMutation>({
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

    const result = await this.githubClient.mutate<AddDiscussionCommentMutation>({
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
    const result = await this.githubClient.mutate<MarkDiscussionCommentAsAnswerMutation>({
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
  
    const result = await this.githubClient.mutate<AddLabelToDiscussionMutation>({
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
    const result = await this.githubClient.mutate<UpdateDiscussionCommentMutation>({
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
}
