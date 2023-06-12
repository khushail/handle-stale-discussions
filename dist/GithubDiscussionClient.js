"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GithubDiscussionClient = void 0;
const core_1 = require("@apollo/client/core");
const core = require("@actions/core");
const cross_fetch_1 = require("cross-fetch");
const graphql_1 = require("./generated/graphql");
class GithubDiscussionClient {
    constructor(owner, repo) {
        this.owner = owner;
        this.repo = repo;
        const githubToken = core.getInput('github-token', { required: false }) || process.env.GITHUB_TOKEN;
        if (!githubToken) {
            throw new Error('You must provide a GitHub token as an input to this action, or as a `GITHUB_TOKEN` env variable. See the README for more info.');
        }
        else {
            this.githubToken = githubToken;
        }
        this.initializeAttentionLabelId();
    }
    get githubClient() {
        if (!this._githubClient) {
            this._githubClient = new core_1.ApolloClient({
                link: new core_1.HttpLink({
                    uri: "https://api.github.com/graphql",
                    headers: {
                        authorization: `token ${this.githubToken}`,
                    },
                    fetch: cross_fetch_1.default
                }),
                cache: new core_1.InMemoryCache(),
            });
        }
        return this._githubClient;
    }
    async initializeAttentionLabelId() {
        if (!this.attentionLabelId) {
            const attentionLabel = core.getInput('attention-label', { required: false }) || 'attention';
            const result = await this.githubClient.query({
                query: graphql_1.GetLabelId,
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
        }
        else {
            return this.attentionLabelId;
        }
    }
    async getTotalDiscussionCount(categoryID) {
        const resultCountObject = await this.githubClient.query({
            query: graphql_1.GetDiscussionCount,
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
    async getDiscussionsMetaData(categoryID) {
        const discussionsCount = await this.getTotalDiscussionCount(categoryID);
        console.log("Total discussion count : " + discussionsCount);
        const result = await this.githubClient.query({
            query: graphql_1.GetDiscussionData,
            variables: {
                owner: this.owner,
                name: this.repo,
                categoryID: categoryID,
                count: discussionsCount,
            },
        });
        if (result.error) {
            throw new Error("Error in retrieving all discussions metadata");
        }
        return result.data.repository?.discussions;
    }
    async getAnswerableDiscussionCategoryIDs() {
        const answerableCategoryIDs = [];
        const result = await this.githubClient.query({
            query: graphql_1.GetAnswerableDiscussionId,
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
        });
        if (answerableCategoryIDs.length === 0) {
            throw new Error("There are no Answerable category discussions in this repository");
        }
        return answerableCategoryIDs;
    }
    async closeDiscussionAsResolved(discussionId) {
        core.info("Closing discussion as resolved");
        const result = await this.githubClient.mutate({
            mutation: graphql_1.CloseDiscussionAsResolved,
            variables: {
                discussionId
            }
        });
        if (result.errors) {
            throw new Error("Error in retrieving result discussion id");
        }
        return result.data?.closeDiscussion?.discussion?.id;
    }
    async closeDiscussionAsOutdated(discussionId) {
        const result = await this.githubClient.mutate({
            mutation: graphql_1.CloseDiscussionAsOutdated,
            variables: {
                discussionId
            }
        });
        if (result.errors) {
            throw new Error("Error in closing outdated discussion");
        }
        return result.data?.closeDiscussion?.discussion?.id;
    }
    async addCommentToDiscussion(discussionId, body) {
        if (discussionId === "") {
            throw new Error(`Couldn't create comment as discussionId is null!`);
        }
        const result = await this.githubClient.mutate({
            mutation: graphql_1.AddDiscussionComment,
            variables: {
                discussionId,
                body,
            },
        });
        if (result.errors) {
            throw new Error("Mutation adding comment to discussion failed with error");
        }
    }
    async markDiscussionCommentAsAnswer(commentId) {
        const result = await this.githubClient.mutate({
            mutation: graphql_1.MarkDiscussionCommentAsAnswer,
            variables: {
                commentId
            }
        });
        if (result.errors) {
            throw new Error("Error in mutation of marking comment as answer, can not proceed");
        }
        return result;
    }
    async addAttentionLabelToDiscussion(discussionId) {
        if (discussionId === "") {
            throw new Error("Invalid discussion id, can not proceed!");
        }
        const result = await this.githubClient.mutate({
            mutation: graphql_1.AddLabelToDiscussion,
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
    async updateDiscussionComment(commentId, body) {
        const result = await this.githubClient.mutate({
            mutation: graphql_1.UpdateDiscussionComment,
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
    async getDiscussionCommentCount(owner, name, discussionNum) {
        const result = await this.githubClient.query({
            query: graphql_1.GetDiscussionCommentCount,
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
    async getCommentReactionCount(owner, name, discussionNum, commentCount) {
        if (commentCount == 0) {
            core.info("Comments on the discussion does not exist!");
            return;
        }
        const result = await this.githubClient.query({
            query: graphql_1.GetCommentReactionCount,
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
    async getCommentReactionData(owner, name, discussionNum, commentCount, reactionCount) {
        if (reactionCount == 0) {
            core.info("No reactions posted on the comments!");
            return;
        }
        const result = await this.githubClient.query({
            query: graphql_1.GetCommentReactionData,
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
    async getCommentsMetaData(discussionNum, commentCount) {
        const result = await this.githubClient.query({
            query: graphql_1.GetCommentMetaData,
            variables: {
                owner: this.owner,
                name: this.repo,
                discussionNumber: discussionNum,
                commentCount: commentCount,
            },
        });
        if (result.error) {
            throw new Error("Error in retrieving comment metadata");
        }
        return result.data.repository?.discussion?.comments;
    }
}
exports.GithubDiscussionClient = GithubDiscussionClient;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiR2l0aHViRGlzY3Vzc2lvbkNsaWVudC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9HaXRodWJEaXNjdXNzaW9uQ2xpZW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLDhDQUFtRztBQUNuRyxzQ0FBc0M7QUFDdEMsNkNBQWdDO0FBRWhDLGlEQWVvRTtBQUVwRSxNQUFhLHNCQUFzQjtJQU9qQyxZQUFZLEtBQWEsRUFBRSxJQUFZO1FBQ3JDLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBQ25CLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ2pCLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsY0FBYyxFQUFFLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxDQUFDLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUM7UUFDbkcsSUFBSSxDQUFDLFdBQVcsRUFBRTtZQUNoQixNQUFNLElBQUksS0FBSyxDQUFDLGdJQUFnSSxDQUFDLENBQUM7U0FDbko7YUFBTTtZQUNMLElBQUksQ0FBQyxXQUFXLEdBQUcsV0FBVyxDQUFDO1NBQ2hDO1FBRUQsSUFBSSxDQUFDLDBCQUEwQixFQUFFLENBQUM7SUFDcEMsQ0FBQztJQUVELElBQUksWUFBWTtRQUNkLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFO1lBQ3ZCLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxtQkFBWSxDQUFDO2dCQUNwQyxJQUFJLEVBQUUsSUFBSSxlQUFRLENBQUM7b0JBQ2pCLEdBQUcsRUFBRSxnQ0FBZ0M7b0JBQ3JDLE9BQU8sRUFBRTt3QkFDUCxhQUFhLEVBQUUsU0FBUyxJQUFJLENBQUMsV0FBVyxFQUFFO3FCQUMzQztvQkFDRCxLQUFLLEVBQUwscUJBQUs7aUJBQ04sQ0FBQztnQkFDRixLQUFLLEVBQUUsSUFBSSxvQkFBYSxFQUFFO2FBQzNCLENBQUMsQ0FBQztTQUNKO1FBQ0QsT0FBTyxJQUFJLENB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dHBMaW5rLCBJbk1lbW9yeUNhY2hlLCBOb3JtYWxpemVkQ2FjaGVPYmplY3QgfSBmcm9tIFwiQGFwb2xsby9jbGllbnQvY29yZVwiO1xuaW1wb3J0ICogYXMgY29yZSBmcm9tICdAYWN0aW9ucy9jb3JlJztcbmltcG9ydCBmZXRjaCBmcm9tICdjcm9zcy1mZXRjaCc7XG5pbXBvcnQgeyBEaXNjdXNzaW9uQ29ubmVjdGlvbiB9IGZyb20gXCJAb2N0b2tpdC9ncmFwaHFsLXNjaGVtYVwiO1xuaW1wb3J0IHsgR2V0RGlzY3Vzc2lvbkNvdW50UXVlcnksIEdldERpc2N1c3Npb25Db3VudFF1ZXJ5VmFyaWFibGVzLCBHZXREaXNjdXNzaW9uQ291bnQsIEdldERpc2N1c3Npb25EYXRhUXVlcnksIFxuICBHZXREaXNjdXNzaW9uRGF0YVF1ZXJ5VmFyaWFibGVzLCBHZXREaXNjdXNzaW9uRGF0YSwgR2V0QW5zd2VyYWJsZURpc2N1c3Npb25JZFF1ZXJ5LCBcbiAgR2V0QW5zd2VyYWJsZURpc2N1c3Npb25JZFF1ZXJ5VmFyaWFibGVzLCBHZXRBbnN3ZXJhYmxlRGlzY3Vzc2lvbklkLCBHZXRMYWJlbElkUXVlcnksIFxuICBHZXRMYWJlbElkLCBDbG9zZURpc2N1c3Npb25Bc1Jlc29sdmVkTXV0YXRpb24sIENsb3NlRGlzY3Vzc2lvbkFzUmVzb2x2ZWQsIFxuICBDbG9zZURpc2N1c3Npb25Bc091dGRhdGVkTXV0YXRpb24sIENsb3NlRGlzY3Vzc2lvbkFzT3V0ZGF0ZWQsIEFkZERpc2N1c3Npb25Db21tZW50TXV0YXRpb24sIFxuICBBZGREaXNjdXNzaW9uQ29tbWVudCwgTWFya0Rpc2N1c3Npb25Db21tZW50QXNBbnN3ZXJNdXRhdGlvbiwgTWFya0Rpc2N1c3Npb25Db21tZW50QXNBbnN3ZXIsIFxuICBBZGRMYWJlbFRvRGlzY3Vzc2lvbk11dGF0aW9uLCBBZGRMYWJlbFRvRGlzY3Vzc2lvbiwgVXBkYXRlRGlzY3Vzc2lvbkNvbW1lbnRNdXRhdGlvbiwgXG4gIFVwZGF0ZURpc2N1c3Npb25Db21tZW50LCBHZXREaXNjdXNzaW9uQ29tbWVudENvdW50UXVlcnksXG4gIEdldERpc2N1c3Npb25Db21tZW50Q291bnQsIEdldENvbW1lbnRSZWFjdGlvbkNvdW50UXVlcnksIEdldENvbW1lbnRSZWFjdGlvbkNvdW50LCBcbiAgR2V0Q29tbWVudFJlYWN0aW9uRGF0YVF1ZXJ5LCBHZXRDb21tZW50UmVhY3Rpb25EYXRhLCBEaXNjdXNzaW9uQ29tbWVudENvbm5lY3Rpb24sIFxuICBHZXRDb21tZW50TWV0YURhdGFRdWVyeSwgR2V0Q29tbWVudE1ldGFEYXRhUXVlcnlWYXJpYWJsZXMsIEdldENvbW1lbnRNZXRhRGF0YSwgR2V0TGFiZWxJZFF1ZXJ5VmFyaWFibGVzLCBcbiAgQ2xvc2VEaXNjdXNzaW9uQXNSZXNvbHZlZE11dGF0aW9uVmFyaWFibGVzLCBDbG9zZURpc2N1c3Npb25Bc091dGRhdGVkTXV0YXRpb25WYXJpYWJsZXMsIFxuICBBZGREaXNjdXNzaW9uQ29tbWVudE11dGF0aW9uVmFyaWFibGVzLCBNYXJrRGlzY3Vzc2lvbkNvbW1lbnRBc0Fuc3dlck11dGF0aW9uVmFyaWFibGVzLCBcbiAgQWRkTGFiZWxUb0Rpc2N1c3Npb25NdXRhdGlvblZhcmlhYmxlcywgVXBkYXRlRGlzY3Vzc2lvbkNvbW1lbnRNdXRhdGlvblZhcmlhYmxlcywgXG4gIEdldERpc2N1c3Npb25Db21tZW50Q291bnRRdWVyeVZhcmlhYmxlcywgR2V0Q29tbWVudFJlYWN0aW9uQ291bnRRdWVyeVZhcmlhYmxlcywgXG4gIEdldENvbW1lbnRSZWFjdGlvbkRhdGFRdWVyeVZhcmlhYmxlcyB9IGZyb20gXCIuL2dlbmVyYXRlZC9ncmFwaHFsXCI7XG5cbmV4cG9ydCBjbGFzcyBHaXRodWJEaXNjdXNzaW9uQ2xpZW50IHtcbiAgcHJpdmF0ZSBfZ2l0aHViQ2xpZW50OiBBcG9sbG9DbGllbnQ8Tm9ybWFsaXplZENhY2hlT2JqZWN0PjtcbiAgcHJpdmF0ZSBnaXRodWJUb2tlbjogc3RyaW5nO1xuICBwcml2YXRlIG93bmVyOiBzdHJpbmc7XG4gIHByaXZhdGUgcmVwbzogc3RyaW5nO1xuICBwcml2YXRlIGF0dGVudGlvbkxhYmVsSWQ6IHN0cmluZztcblxuICBjb25zdHJ1Y3Rvcihvd25lcjogc3RyaW5nLCByZXBvOiBzdHJpbmcpIHtcbiAgICB0aGlzLm93bmVyID0gb3duZXI7XG4gICAgdGhpcy5yZXBvID0gcmVwbztcbiAgICBjb25zdCBnaXRodWJUb2tlbiA9IGNvcmUuZ2V0SW5wdXQoJ2dpdGh1Yi10b2tlbicsIHsgcmVxdWlyZWQ6IGZhbHNlIH0pIHx8IHByb2Nlc3MuZW52LkdJVEhVQl9UT0tFTjtcbiAgICBpZiAoIWdpdGh1YlRva2VuKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1lvdSBtdXN0IHByb3ZpZGUgYSBHaXRIdWIgdG9rZW4gYXMgYW4gaW5wdXQgdG8gdGhpcyBhY3Rpb24sIG9yIGFzIGEgYEdJVEhVQl9UT0tFTmAgZW52IHZhcmlhYmxlLiBTZWUgdGhlIFJFQURNRSBmb3IgbW9yZSBpbmZvLicpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmdpdGh1YlRva2VuID0gZ2l0aHViVG9rZW47XG4gICAgfVxuXG4gICAgdGhpcy5pbml0aWFsaXplQXR0ZW50aW9uTGFiZWxJZCgpO1xuICB9XG5cbiAgZ2V0IGdpdGh1YkNsaWVudCgpOiBBcG9sbG9DbGllbnQ8Tm9ybWFsaXplZENhY2hlT2JqZWN0PiB7XG4gICAgaWYgKCF0aGlzLl9naXRodWJDbGllbnQpIHtcbiAgICAgIHRoaXMuX2dpdGh1YkNsaWVudCA9IG5ldyBBcG9sbG9DbGllbnQoe1xuICAgICAgICBsaW5rOiBuZXcgSHR0cExpbmsoe1xuICAgICAgICAgIHVyaTogXCJodHRwczovL2FwaS5naXRodWIuY29tL2dyYXBocWxcIixcbiAgICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgICBhdXRob3JpemF0aW9uOiBgdG9rZW4gJHt0aGlzLmdpdGh1YlRva2VufWAsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBmZXRjaFxuICAgICAgICB9KSxcbiAgICAgICAgY2FjaGU6IG5ldyBJbk1lbW9yeUNhY2hlKCksXG4gICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuX2dpdGh1YkNsaWVudDtcbiAgfVxuXG4gIGFzeW5jIGluaXRpYWxpemVBdHRlbnRpb25MYWJlbElkKCkge1xuICAgIGlmICghdGhpcy5hdHRlbnRpb25MYWJlbElkKSB7XG4gICAgICBjb25zdCBhdHRlbnRpb25MYWJlbCA9IGNvcmUuZ2V0SW5wdXQoJ2F0dGVudGlvbi1sYWJlbCcsIHsgcmVxdWlyZWQ6IGZhbHNlIH0pIHx8ICdhdHRlbnRpb24nO1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5naXRodWJDbGllbnQucXVlcnk8R2V0TGFiZWxJZFF1ZXJ5LCBHZXRMYWJlbElkUXVlcnlWYXJpYWJsZXM+KHtcbiAgICAgICAgcXVlcnk6IEdldExhYmVsSWQsXG4gICAgICAgIHZhcmlhYmxlczoge1xuICAgICAgICAgIG93bmVyOiB0aGlzLm93bmVyLFxuICAgICAgICAgIG5hbWU6IHRoaXMucmVwbyxcbiAgICAgICAgICBsYWJlbE5hbWU6IGF0dGVudGlvbkxhYmVsXG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBpZiAoIXJlc3VsdC5kYXRhLnJlcG9zaXRvcnk/LmxhYmVsPy5pZCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYENvdWxkbid0IGZpbmQgbWVudGlvbmVkIExhYmVsIWApO1xuICAgICAgfVxuXG4gICAgICB0aGlzLmF0dGVudGlvbkxhYmVsSWQgPSByZXN1bHQuZGF0YS5yZXBvc2l0b3J5Py5sYWJlbD8uaWQ7XG4gICAgICByZXR1cm4gdGhpcy5hdHRlbnRpb25MYWJlbElkO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gdGhpcy5hdHRlbnRpb25MYWJlbElkO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGdldFRvdGFsRGlzY3Vzc2lvbkNvdW50KGNhdGVnb3J5SUQ6IHN0cmluZykge1xuICAgIGNvbnN0IHJlc3VsdENvdW50T2JqZWN0ID0gYXdhaXQgdGhpcy5naXRodWJDbGllbnQucXVlcnk8R2V0RGlzY3Vzc2lvbkNvdW50UXVlcnksIEdldERpc2N1c3Npb25Db3VudFF1ZXJ5VmFyaWFibGVzPih7XG4gICAgICBxdWVyeTogR2V0RGlzY3Vzc2lvbkNvdW50LFxuICAgICAgdmFyaWFibGVzOiB7XG4gICAgICAgIG93bmVyOiB0aGlzLm93bmVyLFxuICAgICAgICBuYW1lOiB0aGlzLnJlcG8sXG4gICAgICAgIGNhdGVnb3J5SWQ6IGNhdGVnb3J5SURcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgaWYgKHJlc3VsdENvdW50T2JqZWN0LmVycm9yKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJFcnJvciBpbiByZWFkaW5nIGRpc2N1c3Npb25zIGNvdW50XCIpO1xuICAgIH1cblxuICAgIGNvcmUuZGVidWcoYFRvdGFsIGRpc2N1c3Npb24gY291bnQgOiAke3Jlc3VsdENvdW50T2JqZWN0LmRhdGEucmVwb3NpdG9yeT8uZGlzY3Vzc2lvbnMudG90YWxDb3VudH1gKTtcbiAgICByZXR1cm4gcmVzdWx0Q291bnRPYmplY3QuZGF0YS5yZXBvc2l0b3J5Py5kaXNjdXNzaW9ucy50b3RhbENvdW50O1xuICB9XG5cbiAgYXN5bmMgZ2V0RGlzY3Vzc2lvbnNNZXRhRGF0YShjYXRlZ29yeUlEOiBzdHJpbmcpOiBQcm9taXNlPERpc2N1c3Npb25Db25uZWN0aW9uPiB7XG4gICAgY29uc3QgZGlzY3Vzc2lvbnNDb3VudCA9IGF3YWl0IHRoaXMuZ2V0VG90YWxEaXNjdXNzaW9uQ291bnQoY2F0ZWdvcnlJRCk7XG4gICAgY29uc29sZS5sb2coXCJUb3RhbCBkaXNjdXNzaW9uIGNvdW50IDogXCIgKyBkaXNjdXNzaW9uc0NvdW50KTtcblxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZ2l0aHViQ2xpZW50LnF1ZXJ5PEdldERpc2N1c3Npb25EYXRhUXVlcnksIEdldERpc2N1c3Npb25EYXRhUXVlcnlWYXJpYWJsZXM+KHtcbiAgICAgIHF1ZXJ5OiBHZXREaXNjdXNzaW9uRGF0YSxcbiAgICAgIHZhcmlhYmxlczoge1xuICAgICAgICBvd25lcjogdGhpcy5vd25lcixcbiAgICAgICAgbmFtZTogdGhpcy5yZXBvLFxuICAgICAgICBjYXRlZ29yeUlEOiBjYXRlZ29yeUlELFxuICAgICAgICBjb3VudDogZGlzY3Vzc2lvbnNDb3VudCEsXG4gICAgICB9LFxuICAgIH0pXG5cbiAgICBpZiAocmVzdWx0LmVycm9yKSB7IHRocm93IG5ldyBFcnJvcihcIkVycm9yIGluIHJldHJpZXZpbmcgYWxsIGRpc2N1c3Npb25zIG1ldGFkYXRhXCIpOyB9XG5cbiAgICByZXR1cm4gcmVzdWx0LmRhdGEucmVwb3NpdG9yeT8uZGlzY3Vzc2lvbnMgYXMgRGlzY3Vzc2lvbkNvbm5lY3Rpb247XG4gIH1cblxuICBhc3luYyBnZXRBbnN3ZXJhYmxlRGlzY3Vzc2lvbkNhdGVnb3J5SURzKCk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3QgYW5zd2VyYWJsZUNhdGVnb3J5SURzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZ2l0aHViQ2xpZW50LnF1ZXJ5PEdldEFuc3dlcmFibGVEaXNjdXNzaW9uSWRRdWVyeSwgR2V0QW5zd2VyYWJsZURpc2N1c3Npb25JZFF1ZXJ5VmFyaWFibGVzPih7XG4gICAgICBxdWVyeTogR2V0QW5zd2VyYWJsZURpc2N1c3Npb25JZCxcbiAgICAgIHZhcmlhYmxlczoge1xuICAgICAgICBvd25lcjogdGhpcy5vd25lcixcbiAgICAgICAgbmFtZTogdGhpcy5yZXBvXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKCFyZXN1bHQuZGF0YS5yZXBvc2l0b3J5KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYENvdWxkbid0IGZpbmQgcmVwb3NpdG9yeSBpZCFgKTtcbiAgICB9XG5cbiAgICAvL2l0ZXJhdGUgb3ZlciBkaXNjdXNzaW9uIGNhdGVnb3JpZXMgdG8gZ2V0IHRoZSBpZCBmb3IgYW5zd2VyYWJsZSBvbmVcbiAgICByZXN1bHQuZGF0YS5yZXBvc2l0b3J5LmRpc2N1c3Npb25DYXRlZ29yaWVzLmVkZ2VzPy5mb3JFYWNoKGVsZW1lbnQgPT4ge1xuICAgICAgaWYgKGVsZW1lbnQ/Lm5vZGU/LmlzQW5zd2VyYWJsZSA9PSB0cnVlKSB7XG4gICAgICAgIGFuc3dlcmFibGVDYXRlZ29yeUlEcy5wdXNoKGVsZW1lbnQ/Lm5vZGU/LmlkKTtcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgaWYgKGFuc3dlcmFibGVDYXRlZ29yeUlEcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlRoZXJlIGFyZSBubyBBbnN3ZXJhYmxlIGNhdGVnb3J5IGRpc2N1c3Npb25zIGluIHRoaXMgcmVwb3NpdG9yeVwiKTtcbiAgICB9XG5cbiAgICByZXR1cm4gYW5zd2VyYWJsZUNhdGVnb3J5SURzO1xuICB9XG5cbiAgYXN5bmMgY2xvc2VEaXNjdXNzaW9uQXNSZXNvbHZlZChkaXNjdXNzaW9uSWQ6IHN0cmluZykge1xuICAgIGNvcmUuaW5mbyhcIkNsb3NpbmcgZGlzY3Vzc2lvbiBhcyByZXNvbHZlZFwiKTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmdpdGh1YkNsaWVudC5tdXRhdGU8Q2xvc2VEaXNjdXNzaW9uQXNSZXNvbHZlZE11dGF0aW9uLCBDbG9zZURpc2N1c3Npb25Bc1Jlc29sdmVkTXV0YXRpb25WYXJpYWJsZXM+KHtcbiAgICAgIG11dGF0aW9uOiBDbG9zZURpc2N1c3Npb25Bc1Jlc29sdmVkLFxuICAgICAgdmFyaWFibGVzOiB7XG4gICAgICAgIGRpc2N1c3Npb25JZFxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgaWYgKHJlc3VsdC5lcnJvcnMpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkVycm9yIGluIHJldHJpZXZpbmcgcmVzdWx0IGRpc2N1c3Npb24gaWRcIik7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdC5kYXRhPy5jbG9zZURpc2N1c3Npb24/LmRpc2N1c3Npb24/LmlkO1xuICB9XG5cbiAgYXN5bmMgY2xvc2VEaXNjdXNzaW9uQXNPdXRkYXRlZChkaXNjdXNzaW9uSWQ6IHN0cmluZykge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZ2l0aHViQ2xpZW50Lm11dGF0ZTxDbG9zZURpc2N1c3Npb25Bc091dGRhdGVkTXV0YXRpb24sIENsb3NlRGlzY3Vzc2lvbkFzT3V0ZGF0ZWRNdXRhdGlvblZhcmlhYmxlcz4oe1xuICAgICAgbXV0YXRpb246IENsb3NlRGlzY3Vzc2lvbkFzT3V0ZGF0ZWQsXG4gICAgICB2YXJpYWJsZXM6IHtcbiAgICAgICAgZGlzY3Vzc2lvbklkXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBpZiAocmVzdWx0LmVycm9ycykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRXJyb3IgaW4gY2xvc2luZyBvdXRkYXRlZCBkaXNjdXNzaW9uXCIpO1xuICAgIH1cblxuICAgIHJldHVybiByZXN1bHQuZGF0YT8uY2xvc2VEaXNjdXNzaW9uPy5kaXNjdXNzaW9uPy5pZDtcbiAgfVxuXG4gIGFzeW5jIGFkZENvbW1lbnRUb0Rpc2N1c3Npb24oZGlzY3Vzc2lvbklkOiBzdHJpbmcsIGJvZHk6IHN0cmluZykge1xuICAgIGlmIChkaXNjdXNzaW9uSWQgPT09IFwiXCIpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgQ291bGRuJ3QgY3JlYXRlIGNvbW1lbnQgYXMgZGlzY3Vzc2lvbklkIGlzIG51bGwhYCk7XG4gICAgfVxuXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5naXRodWJDbGllbnQubXV0YXRlPEFkZERpc2N1c3Npb25Db21tZW50TXV0YXRpb24sIEFkZERpc2N1c3Npb25Db21tZW50TXV0YXRpb25WYXJpYWJsZXM+KHtcbiAgICAgIG11dGF0aW9uOiBBZGREaXNjdXNzaW9uQ29tbWVudCxcbiAgICAgIHZhcmlhYmxlczoge1xuICAgICAgICBkaXNjdXNzaW9uSWQsXG4gICAgICAgIGJvZHksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKHJlc3VsdC5lcnJvcnMpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIk11dGF0aW9uIGFkZGluZyBjb21tZW50IHRvIGRpc2N1c3Npb24gZmFpbGVkIHdpdGggZXJyb3JcIik7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgbWFya0Rpc2N1c3Npb25Db21tZW50QXNBbnN3ZXIoY29tbWVudElkOiBzdHJpbmcpIHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmdpdGh1YkNsaWVudC5tdXRhdGU8TWFya0Rpc2N1c3Npb25Db21tZW50QXNBbnN3ZXJNdXRhdGlvbiwgTWFya0Rpc2N1c3Npb25Db21tZW50QXNBbnN3ZXJNdXRhdGlvblZhcmlhYmxlcz4oe1xuICAgICAgbXV0YXRpb246IE1hcmtEaXNjdXNzaW9uQ29tbWVudEFzQW5zd2VyLFxuICAgICAgdmFyaWFibGVzOiB7XG4gICAgICAgIGNvbW1lbnRJZFxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgaWYgKHJlc3VsdC5lcnJvcnMpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkVycm9yIGluIG11dGF0aW9uIG9mIG1hcmtpbmcgY29tbWVudCBhcyBhbnN3ZXIsIGNhbiBub3QgcHJvY2VlZFwiKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgYXN5bmMgYWRkQXR0ZW50aW9uTGFiZWxUb0Rpc2N1c3Npb24oZGlzY3Vzc2lvbklkOiBzdHJpbmcpIHtcbiAgICBpZiAoZGlzY3Vzc2lvbklkID09PSBcIlwiKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJJbnZhbGlkIGRpc2N1c3Npb24gaWQsIGNhbiBub3QgcHJvY2VlZCFcIik7XG4gICAgfVxuXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5naXRodWJDbGllbnQubXV0YXRlPEFkZExhYmVsVG9EaXNjdXNzaW9uTXV0YXRpb24sIEFkZExhYmVsVG9EaXNjdXNzaW9uTXV0YXRpb25WYXJpYWJsZXM+KHtcbiAgICAgIG11dGF0aW9uOiBBZGRMYWJlbFRvRGlzY3Vzc2lvbixcbiAgICAgIHZhcmlhYmxlczoge1xuICAgICAgICBsYWJlbGFibGVJZDogZGlzY3Vzc2lvbklkLFxuICAgICAgICBsYWJlbElkczogdGhpcy5hdHRlbnRpb25MYWJlbElkLFxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgaWYgKHJlc3VsdC5lcnJvcnMpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkVycm9yIGluIG11dGF0aW9uIG9mIGFkZGluZyBsYWJlbCB0byBkaXNjdXNzaW9uLCBjYW4gbm90IHByb2NlZWQhXCIpO1xuICAgIH1cblxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBhc3luYyB1cGRhdGVEaXNjdXNzaW9uQ29tbWVudChjb21tZW50SWQ6IHN0cmluZywgYm9keTogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5naXRodWJDbGllbnQubXV0YXRlPFVwZGF0ZURpc2N1c3Npb25Db21tZW50TXV0YXRpb24sIFVwZGF0ZURpc2N1c3Npb25Db21tZW50TXV0YXRpb25WYXJpYWJsZXM+KHtcbiAgICAgIG11dGF0aW9uOiBVcGRhdGVEaXNjdXNzaW9uQ29tbWVudCxcbiAgICAgIHZhcmlhYmxlczoge1xuICAgICAgICBjb21tZW50SWQsXG4gICAgICAgIGJvZHlcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGlmIChyZXN1bHQuZXJyb3JzKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJFcnJvciBpbiB1cGRhdGluZyBkaXNjdXNzaW9uIGNvbW1lbnRcIik7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGFzeW5jIGdldERpc2N1c3Npb25Db21tZW50Q291bnQob3duZXI6IHN0cmluZywgbmFtZTogc3RyaW5nLCBkaXNjdXNzaW9uTnVtOiBudW1iZXIpOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZ2l0aHViQ2xpZW50LnF1ZXJ5PEdldERpc2N1c3Npb25Db21tZW50Q291bnRRdWVyeSwgR2V0RGlzY3Vzc2lvbkNvbW1lbnRDb3VudFF1ZXJ5VmFyaWFibGVzPih7XG4gICAgICBxdWVyeTogR2V0RGlzY3Vzc2lvbkNvbW1lbnRDb3VudCxcbiAgICAgIHZhcmlhYmxlczoge1xuICAgICAgICBvd25lcjogdGhpcy5vd25lcixcbiAgICAgICAgbmFtZTogdGhpcy5yZXBvLFxuICAgICAgICBudW06IGRpc2N1c3Npb25OdW1cbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBpZiAocmVzdWx0LmVycm9yKVxuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRXJyb3IgaW4gcmV0cmlldmluZyBjb21tZW50IGNvdW50IHJlbGF0ZWQgdG8gZGlzY3Vzc2lvbiFcIik7XG5cbiAgICByZXR1cm4gcmVzdWx0LmRhdGEucmVwb3NpdG9yeT8uZGlzY3Vzc2lvbj8uY29tbWVudHMudG90YWxDb3VudDtcbiAgfVxuXG5cbiAgYXN5bmMgZ2V0Q29tbWVudFJlYWN0aW9uQ291bnQob3duZXI6IHN0cmluZywgbmFtZTogc3RyaW5nLCBkaXNjdXNzaW9uTnVtOiBudW1iZXIsIGNvbW1lbnRDb3VudDogbnVtYmVyKTogUHJvbWlzZTxhbnk+IHtcbiAgICBpZiAoY29tbWVudENvdW50ID09IDApIHtcbiAgICAgIGNvcmUuaW5mbyhcIkNvbW1lbnRzIG9uIHRoZSBkaXNjdXNzaW9uIGRvZXMgbm90IGV4aXN0IVwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmdpdGh1YkNsaWVudC5xdWVyeTxHZXRDb21tZW50UmVhY3Rpb25Db3VudFF1ZXJ5LCBHZXRDb21tZW50UmVhY3Rpb25Db3VudFF1ZXJ5VmFyaWFibGVzPih7XG4gICAgICBxdWVyeTogR2V0Q29tbWVudFJlYWN0aW9uQ291bnQsXG4gICAgICB2YXJpYWJsZXM6IHtcbiAgICAgICAgb3duZXI6IHRoaXMub3duZXIsXG4gICAgICAgIG5hbWU6IHRoaXMucmVwbyxcbiAgICAgICAgZGlzY3Vzc2lvbk51bWJlcjogZGlzY3Vzc2lvbk51bSxcbiAgICAgICAgY29tbWVudENvdW50OiBjb21tZW50Q291bnRcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBpZiAocmVzdWx0LmVycm9yKVxuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRXJyb3IgaW4gcmV0cmlldmluZyBjb21tZW50IGNvdW50IHJlbGF0ZWQgdG8gZGlzY3Vzc2lvbiFcIik7XG5cbiAgICByZXR1cm4gcmVzdWx0LmRhdGEucmVwb3NpdG9yeT8uZGlzY3Vzc2lvbj8uY29tbWVudHM/LmVkZ2VzO1xuICB9XG5cbiAgYXN5bmMgZ2V0Q29tbWVudFJlYWN0aW9uRGF0YShvd25lcjogc3RyaW5nLCBuYW1lOiBzdHJpbmcsIGRpc2N1c3Npb25OdW06IG51bWJlciwgY29tbWVudENvdW50OiBudW1iZXIsIHJlYWN0aW9uQ291bnQ6IG51bWJlcik6IFByb21pc2U8YW55PiB7XG4gICAgaWYgKHJlYWN0aW9uQ291bnQgPT0gMCkge1xuICAgICAgY29yZS5pbmZvKFwiTm8gcmVhY3Rpb25zIHBvc3RlZCBvbiB0aGUgY29tbWVudHMhXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZ2l0aHViQ2xpZW50LnF1ZXJ5PEdldENvbW1lbnRSZWFjdGlvbkRhdGFRdWVyeSwgR2V0Q29tbWVudFJlYWN0aW9uRGF0YVF1ZXJ5VmFyaWFibGVzPih7XG4gICAgICBxdWVyeTogR2V0Q29tbWVudFJlYWN0aW9uRGF0YSxcbiAgICAgIHZhcmlhYmxlczoge1xuICAgICAgICBvd25lcjogdGhpcy5vd25lcixcbiAgICAgICAgbmFtZTogdGhpcy5yZXBvLFxuICAgICAgICBkaXNjdXNzaW9uTnVtYmVyOiBkaXNjdXNzaW9uTnVtLFxuICAgICAgICBjb21tZW50Q291bnQ6IGNvbW1lbnRDb3VudCxcbiAgICAgICAgcmVhY3Rpb25Db3VudDogcmVhY3Rpb25Db3VudFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChyZXN1bHQuZXJyb3IpXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJFcnJvciBpbiByZXRyaWV2aW5nIHJlYWN0aW9uIG9uIGNvbW1lbnQhXCIpO1xuXG4gICAgcmV0dXJuIHJlc3VsdC5kYXRhLnJlcG9zaXRvcnk/LmRpc2N1c3Npb24/LmNvbW1lbnRzLmVkZ2VzO1xuICB9XG5cblxuICBhc3luYyBnZXRDb21tZW50c01ldGFEYXRhKGRpc2N1c3Npb25OdW06IG51bWJlciwgY29tbWVudENvdW50OiBudW1iZXIpOiBQcm9taXNlPERpc2N1c3Npb25Db21tZW50Q29ubmVjdGlvbj4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZ2l0aHViQ2xpZW50LnF1ZXJ5PEdldENvbW1lbnRNZXRhRGF0YVF1ZXJ5LCBHZXRDb21tZW50TWV0YURhdGFRdWVyeVZhcmlhYmxlcz4oe1xuICAgICAgcXVlcnk6IEdldENvbW1lbnRNZXRhRGF0YSxcbiAgICAgIHZhcmlhYmxlczoge1xuICAgICAgICBvd25lcjogdGhpcy5vd25lcixcbiAgICAgICAgbmFtZTogdGhpcy5yZXBvLFxuICAgICAgICBkaXNjdXNzaW9uTnVtYmVyOiBkaXNjdXNzaW9uTnVtLFxuICAgICAgICBjb21tZW50Q291bnQ6IGNvbW1lbnRDb3VudCxcbiAgICAgIH0sXG4gICAgfSlcblxuICAgIGlmIChyZXN1bHQuZXJyb3IpIHsgdGhyb3cgbmV3IEVycm9yKFwiRXJyb3IgaW4gcmV0cmlldmluZyBjb21tZW50IG1ldGFkYXRhXCIpOyB9XG5cbiAgICByZXR1cm4gcmVzdWx0LmRhdGEucmVwb3NpdG9yeT8uZGlzY3Vzc2lvbj8uY29tbWVudHMgYXMgRGlzY3Vzc2lvbkNvbW1lbnRDb25uZWN0aW9uO1xuICB9XG5cbn1cbiJdfQ==