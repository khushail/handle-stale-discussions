"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GithubDiscussionClient = void 0;
const core_1 = require("@apollo/client/core");
const core = require("@actions/core");
const github = require("@actions/github");
const cross_fetch_1 = require("cross-fetch");
const graphql_1 = require("./generated/graphql");
class GithubDiscussionClient {
    constructor() {
        const githubToken = core.getInput('github-token', { required: false }) || process.env.GITHUB_TOKEN;
        if (!githubToken) {
            throw new Error('You must provide a GitHub token as an input to this action, or as a `GITHUB_TOKEN` env variable. See the README for more info.');
        }
        this.owner = github.context.repo.owner;
        this.repo = github.context.repo.repo;
        this.githubToken = githubToken;
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
                cache: new core_1.InMemoryCache({
                    typePolicies: {
                        Query: {
                            fields: {
                                repository: {
                                    merge: false
                                },
                            }
                        }
                    }
                }),
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
                throw new Error(`Couldn't find label ${attentionLabel} in repository. Please create this label and try again.`);
            }
            this.attentionLabelId = result.data.repository?.label?.id;
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
            core.warning(`Error in reading discussions count for discussions category ${categoryID}: ${resultCountObject.error}`);
            return 0;
        }
        core.debug(`Total discussion count for Category ${categoryID}: ${resultCountObject.data.repository?.discussions.totalCount}`);
        return resultCountObject.data.repository?.discussions.totalCount;
    }
    async getDiscussionCommentCount(discussionNum) {
        const result = await this.githubClient.query({
            query: graphql_1.GetDiscussionCommentCount,
            variables: {
                owner: this.owner,
                name: this.repo,
                num: discussionNum
            },
        });
        if (result.error) {
            core.warning(`Error retrieving comment count for discussion ${discussionNum}: ${result.error}`);
            return 0;
        }
        return result.data.repository?.discussion?.comments.totalCount;
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
            core.warning(`Error retrieving comment metadata for discussion ${discussionNum}: ${result.error}`);
            return {};
        }
        return result.data.repository?.discussion?.comments;
    }
    async getDiscussionsMetaData(categoryID, pageSize, afterCursor) {
        const discussionsCount = await this.getTotalDiscussionCount(categoryID);
        const result = await this.githubClient.query({
            query: graphql_1.GetDiscussionData,
            variables: {
                owner: this.owner,
                name: this.repo,
                categoryID: categoryID,
                pageSize: pageSize,
                after: afterCursor,
            },
        });
        if (result.error) {
            core.warning(`Error retrieving discussions metadata for category ${categoryID}: ${result.error}`);
            return {};
        }
        return result.data.repository?.discussions;
    }
    async getAnswerableDiscussionCategoryIDs() {
        const result = await this.githubClient.query({
            query: graphql_1.GetAnswerableDiscussionId,
            variables: {
                owner: this.owner,
                name: this.repo
            },
        });
        if (!result.data.repository) {
            throw new Error(`Couldn't find repository ${this.repo} in owner ${this.owner}`);
        }
        const answerableCategoryIDs = [];
        result.data.repository.discussionCategories.edges?.forEach(element => {
            if (element?.node?.isAnswerable == true) {
                answerableCategoryIDs.push(element?.node?.id);
            }
        });
        if (!answerableCategoryIDs.length) {
            throw new Error('There are no answerable discussion categories in this repository, this GitHub Action only works on answerable discussion categories.');
        }
        return answerableCategoryIDs;
    }
    async closeDiscussionAsResolved(discussionId) {
        const result = await this.githubClient.mutate({
            mutation: graphql_1.CloseDiscussionAsResolved,
            variables: {
                discussionId
            }
        });
        if (result.errors) {
            throw new Error(`Error closing discussion ${discussionId} as resolved: ${result.errors}`);
        }
    }
    async closeDiscussionAsOutdated(discussionId) {
        const result = await this.githubClient.mutate({
            mutation: graphql_1.CloseDiscussionAsOutdated,
            variables: {
                discussionId
            }
        });
        if (result.errors) {
            throw new Error(`Error closing outdated discussion ${discussionId}: ${result.errors}`);
        }
    }
    async addCommentToDiscussion(discussionId, body) {
        const result = await this.githubClient.mutate({
            mutation: graphql_1.AddDiscussionComment,
            variables: {
                body,
                discussionId
            },
        });
        if (result.errors) {
            throw new Error(`Error adding comment to discussion ${discussionId}: ${result.errors}`);
        }
    }
    async addInstructionTextReply(body, discussionId, replyToId) {
        const result = await this.githubClient.mutate({
            mutation: graphql_1.AddInstructionTextReply,
            variables: {
                body,
                discussionId,
                replyToId
            },
        });
        if (result.errors) {
            throw new Error(`Error adding Instruction text to discussion ${discussionId}: ${result.errors}`);
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
            throw new Error(`Error marking comment ${commentId} as answer: ${result.errors}`);
        }
    }
    async addAttentionLabelToDiscussion(discussionId) {
        const result = await this.githubClient.mutate({
            mutation: graphql_1.AddLabelToDiscussion,
            variables: {
                labelableId: discussionId,
                labelIds: this.attentionLabelId,
            }
        });
        if (result.errors) {
            throw new Error(`Error adding label to discussion ${discussionId}: ${result.errors}`);
        }
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
            throw new Error(`Error updating discussion comment ${commentId}: ${result.errors}`);
        }
    }
}
exports.GithubDiscussionClient = GithubDiscussionClient;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiR2l0aHViRGlzY3Vzc2lvbkNsaWVudC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9HaXRodWJEaXNjdXNzaW9uQ2xpZW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLDhDQUFtSDtBQUNuSCxzQ0FBc0M7QUFDdEMsMENBQTBDO0FBQzFDLDZDQUFnQztBQUVoQyxpREFBeXRDO0FBRXp0QyxNQUFhLHNCQUFzQjtJQU9qQztRQUNFLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsY0FBYyxFQUFFLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxDQUFDLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUM7UUFDbkcsSUFBSSxDQUFDLFdBQVcsRUFBRTtZQUNoQixNQUFNLElBQUksS0FBSyxDQUFDLGdJQUFnSSxDQUFDLENBQUM7U0FDbko7UUFDRCxJQUFJLENBQUMsS0FBSyxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQztRQUN2QyxJQUFJLENBQUMsSUFBSSxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQztRQUNyQyxJQUFJLENBQUMsV0FBVyxHQUFHLFdBQVcsQ0FBQztJQUNqQyxDQUFDO0lBRUQsSUFBVyxZQUFZO1FBQ3JCLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFO1lBQ3ZCLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxtQkFBWSxDQUFDO2dCQUNwQyxJQUFJLEVBQUUsSUFBSSxlQUFRLENBQUM7b0JBQ2pCLEdBQUcsRUFBRSxnQ0FBZ0M7b0JBQ3JDLE9BQU8sRUFBRTt3QkFDUCxhQUFhLEVBQUUsU0FBUyxJQUFJLENBQUMsV0FBVyxFQUFFO3FCQUMzQztvQkFDRCxLQUFLLEVBQUwscUJBQUs7aUJBQ04sQ0FBQztnQkFDRixLQUFLLEVBQUUsSUFBSSxvQkFBYSxDQUFDO29CQUN2QixZQUFZLEVBQUU7d0JBQ1osS0FB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QUFTO2dCQUNULElBQUk7YUFDTDtTQUNGLENBQUMsQ0FBQztRQUVILElBQUksTUFBTSxDQUFDLE1BQU0sRUFBRTtZQUNqQixNQUFNLElBQUksS0FBSyxDQUFDLHFDQUFxQyxTQUFTLEtBQUssTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7U0FDckY7SUFDSCxDQUFDO0NBQ0Y7QUF0UUQsd0RBc1FDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQXBvbGxvQ2xpZW50LCBEZWZhdWx0T3B0aW9ucywgSHR0cExpbmssIEluTWVtb3J5Q2FjaGUsIE5vcm1hbGl6ZWRDYWNoZU9iamVjdCB9IGZyb20gXCJAYXBvbGxvL2NsaWVudC9jb3JlXCI7XG5pbXBvcnQgKiBhcyBjb3JlIGZyb20gJ0BhY3Rpb25zL2NvcmUnO1xuaW1wb3J0ICogYXMgZ2l0aHViIGZyb20gJ0BhY3Rpb25zL2dpdGh1Yic7XG5pbXBvcnQgZmV0Y2ggZnJvbSAnY3Jvc3MtZmV0Y2gnO1xuaW1wb3J0IHsgRGlzY3Vzc2lvbkNvbm5lY3Rpb24gfSBmcm9tIFwiQG9jdG9raXQvZ3JhcGhxbC1zY2hlbWFcIjtcbmltcG9ydCB7IEdldERpc2N1c3Npb25Db3VudFF1ZXJ5LCBHZXREaXNjdXNzaW9uQ291bnRRdWVyeVZhcmlhYmxlcywgR2V0RGlzY3Vzc2lvbkNvdW50LCBHZXREaXNjdXNzaW9uRGF0YVF1ZXJ5LCBHZXREaXNjdXNzaW9uRGF0YVF1ZXJ5VmFyaWFibGVzLCBHZXREaXNjdXNzaW9uRGF0YSwgR2V0QW5zd2VyYWJsZURpc2N1c3Npb25JZFF1ZXJ5LCBHZXRBbnN3ZXJhYmxlRGlzY3Vzc2lvbklkUXVlcnlWYXJpYWJsZXMsIEdldEFuc3dlcmFibGVEaXNjdXNzaW9uSWQsIEdldExhYmVsSWRRdWVyeSwgR2V0TGFiZWxJZCwgQ2xvc2VEaXNjdXNzaW9uQXNSZXNvbHZlZE11dGF0aW9uLCBDbG9zZURpc2N1c3Npb25Bc1Jlc29sdmVkLCBDbG9zZURpc2N1c3Npb25Bc091dGRhdGVkTXV0YXRpb24sIENsb3NlRGlzY3Vzc2lvbkFzT3V0ZGF0ZWQsIEFkZERpc2N1c3Npb25Db21tZW50TXV0YXRpb24sIEFkZERpc2N1c3Npb25Db21tZW50LCBNYXJrRGlzY3Vzc2lvbkNvbW1lbnRBc0Fuc3dlck11dGF0aW9uLCBNYXJrRGlzY3Vzc2lvbkNvbW1lbnRBc0Fuc3dlciwgQWRkTGFiZWxUb0Rpc2N1c3Npb25NdXRhdGlvbiwgQWRkTGFiZWxUb0Rpc2N1c3Npb24sIFVwZGF0ZURpc2N1c3Npb25Db21tZW50TXV0YXRpb24sIFVwZGF0ZURpc2N1c3Npb25Db21tZW50LCBHZXREaXNjdXNzaW9uQ29tbWVudENvdW50UXVlcnksIEdldERpc2N1c3Npb25Db21tZW50Q291bnQsIERpc2N1c3Npb25Db21tZW50Q29ubmVjdGlvbiwgR2V0Q29tbWVudE1ldGFEYXRhUXVlcnksIEdldENvbW1lbnRNZXRhRGF0YVF1ZXJ5VmFyaWFibGVzLCBHZXRDb21tZW50TWV0YURhdGEsIENsb3NlRGlzY3Vzc2lvbkFzUmVzb2x2ZWRNdXRhdGlvblZhcmlhYmxlcywgQ2xvc2VEaXNjdXNzaW9uQXNPdXRkYXRlZE11dGF0aW9uVmFyaWFibGVzLCBBZGREaXNjdXNzaW9uQ29tbWVudE11dGF0aW9uVmFyaWFibGVzLCBNYXJrRGlzY3Vzc2lvbkNvbW1lbnRBc0Fuc3dlck11dGF0aW9uVmFyaWFibGVzLCBBZGRMYWJlbFRvRGlzY3Vzc2lvbk11dGF0aW9uVmFyaWFibGVzLCBVcGRhdGVEaXNjdXNzaW9uQ29tbWVudE11dGF0aW9uVmFyaWFibGVzLCBHZXREaXNjdXNzaW9uQ29tbWVudENvdW50UXVlcnlWYXJpYWJsZXMsIEFkZEluc3RydWN0aW9uVGV4dFJlcGx5TXV0YXRpb24sIEFkZEluc3RydWN0aW9uVGV4dFJlcGx5TXV0YXRpb25WYXJpYWJsZXMsIEFkZEluc3RydWN0aW9uVGV4dFJlcGx5IH0gZnJvbSBcIi4vZ2VuZXJhdGVkL2dyYXBocWxcIjtcblxuZXhwb3J0IGNsYXNzIEdpdGh1YkRpc2N1c3Npb25DbGllbnQge1xuICBwcml2YXRlIF9naXRodWJDbGllbnQ6IEFwb2xsb0NsaWVudDxOb3JtYWxpemVkQ2FjaGVPYmplY3Q+O1xuICBwcml2YXRlIGdpdGh1YlRva2VuOiBzdHJpbmc7XG4gIHByaXZhdGUgb3duZXI6IHN0cmluZztcbiAgcHJpdmF0ZSByZXBvOiBzdHJpbmc7XG4gIHByaXZhdGUgYXR0ZW50aW9uTGFiZWxJZDogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIGNvbnN0IGdpdGh1YlRva2VuID0gY29yZS5nZXRJbnB1dCgnZ2l0aHViLXRva2VuJywgeyByZXF1aXJlZDogZmFsc2UgfSkgfHwgcHJvY2Vzcy5lbnYuR0lUSFVCX1RPS0VOO1xuICAgIGlmICghZ2l0aHViVG9rZW4pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignWW91IG11c3QgcHJvdmlkZSBhIEdpdEh1YiB0b2tlbiBhcyBhbiBpbnB1dCB0byB0aGlzIGFjdGlvbiwgb3IgYXMgYSBgR0lUSFVCX1RPS0VOYCBlbnYgdmFyaWFibGUuIFNlZSB0aGUgUkVBRE1FIGZvciBtb3JlIGluZm8uJyk7XG4gICAgfVxuICAgIHRoaXMub3duZXIgPSBnaXRodWIuY29udGV4dC5yZXBvLm93bmVyO1xuICAgIHRoaXMucmVwbyA9IGdpdGh1Yi5jb250ZXh0LnJlcG8ucmVwbztcbiAgICB0aGlzLmdpdGh1YlRva2VuID0gZ2l0aHViVG9rZW47XG4gIH1cblxuICBwdWJsaWMgZ2V0IGdpdGh1YkNsaWVudCgpOiBBcG9sbG9DbGllbnQ8Tm9ybWFsaXplZENhY2hlT2JqZWN0PiB7XG4gICAgaWYgKCF0aGlzLl9naXRodWJDbGllbnQpIHtcbiAgICAgIHRoaXMuX2dpdGh1YkNsaWVudCA9IG5ldyBBcG9sbG9DbGllbnQoe1xuICAgICAgICBsaW5rOiBuZXcgSHR0cExpbmsoe1xuICAgICAgICAgIHVyaTogXCJodHRwczovL2FwaS5naXRodWIuY29tL2dyYXBocWxcIixcbiAgICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgICBhdXRob3JpemF0aW9uOiBgdG9rZW4gJHt0aGlzLmdpdGh1YlRva2VufWAsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBmZXRjaFxuICAgICAgICB9KSxcbiAgICAgICAgY2FjaGU6IG5ldyBJbk1lbW9yeUNhY2hlKHtcbiAgICAgICAgICB0eXBlUG9saWNpZXM6IHtcbiAgICAgICAgICAgIFF1ZXJ5OiB7XG4gICAgICAgICAgICAgIGZpZWxkczoge1xuICAgICAgICAgICAgICAgIHJlcG9zaXRvcnk6IHtcbiAgICAgICAgICAgICAgICAgIG1lcmdlOiBmYWxzZVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH0pLFxuICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLl9naXRodWJDbGllbnQ7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgaW5pdGlhbGl6ZUF0dGVudGlvbkxhYmVsSWQoKSB7XG4gICAgaWYgKCF0aGlzLmF0dGVudGlvbkxhYmVsSWQpIHtcbiAgICAgIGNvbnN0IGF0dGVudGlvbkxhYmVsID0gY29yZS5nZXRJbnB1dCgnYXR0ZW50aW9uLWxhYmVsJywgeyByZXF1aXJlZDogZmFsc2UgfSkgfHwgJ2F0dGVudGlvbic7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmdpdGh1YkNsaWVudC5xdWVyeTxHZXRMYWJlbElkUXVlcnk+KHtcbiAgICAgICAgcXVlcnk6IEdldExhYmVsSWQsXG4gICAgICAgIHZhcmlhYmxlczoge1xuICAgICAgICAgIG93bmVyOiB0aGlzLm93bmVyLFxuICAgICAgICAgIG5hbWU6IHRoaXMucmVwbyxcbiAgICAgICAgICBsYWJlbE5hbWU6IGF0dGVudGlvbkxhYmVsXG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBpZiAoIXJlc3VsdC5kYXRhLnJlcG9zaXRvcnk/LmxhYmVsPy5pZCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYENvdWxkbid0IGZpbmQgbGFiZWwgJHthdHRlbnRpb25MYWJlbH0gaW4gcmVwb3NpdG9yeS4gUGxlYXNlIGNyZWF0ZSB0aGlzIGxhYmVsIGFuZCB0cnkgYWdhaW4uYCk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuYXR0ZW50aW9uTGFiZWxJZCA9IHJlc3VsdC5kYXRhLnJlcG9zaXRvcnk/LmxhYmVsPy5pZDtcbiAgICB9XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZ2V0VG90YWxEaXNjdXNzaW9uQ291bnQoY2F0ZWdvcnlJRDogc3RyaW5nKTogUHJvbWlzZTxudW1iZXI+IHtcbiAgICBjb25zdCByZXN1bHRDb3VudE9iamVjdCA9IGF3YWl0IHRoaXMuZ2l0aHViQ2xpZW50LnF1ZXJ5PEdldERpc2N1c3Npb25Db3VudFF1ZXJ5LCBHZXREaXNjdXNzaW9uQ291bnRRdWVyeVZhcmlhYmxlcz4oe1xuICAgICAgcXVlcnk6IEdldERpc2N1c3Npb25Db3VudCxcbiAgICAgIHZhcmlhYmxlczoge1xuICAgICAgICBvd25lcjogdGhpcy5vd25lcixcbiAgICAgICAgbmFtZTogdGhpcy5yZXBvLFxuICAgICAgICBjYXRlZ29yeUlkOiBjYXRlZ29yeUlEXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKHJlc3VsdENvdW50T2JqZWN0LmVycm9yKSB7XG4gICAgICBjb3JlLndhcm5pbmcoYEVycm9yIGluIHJlYWRpbmcgZGlzY3Vzc2lvbnMgY291bnQgZm9yIGRpc2N1c3Npb25zIGNhdGVnb3J5ICR7Y2F0ZWdvcnlJRH06ICR7cmVzdWx0Q291bnRPYmplY3QuZXJyb3J9YCk7XG4gICAgICByZXR1cm4gMDtcbiAgICB9XG5cbiAgICBjb3JlLmRlYnVnKGBUb3RhbCBkaXNjdXNzaW9uIGNvdW50IGZvciBDYXRlZ29yeSAke2NhdGVnb3J5SUR9OiAke3Jlc3VsdENvdW50T2JqZWN0LmRhdGEucmVwb3NpdG9yeT8uZGlzY3Vzc2lvbnMudG90YWxDb3VudH1gKTtcbiAgICByZXR1cm4gcmVzdWx0Q291bnRPYmplY3QuZGF0YS5yZXBvc2l0b3J5Py5kaXNjdXNzaW9ucy50b3RhbENvdW50ITtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBnZXREaXNjdXNzaW9uQ29tbWVudENvdW50KGRpc2N1c3Npb25OdW06IG51bWJlcik6IFByb21pc2U8bnVtYmVyPiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5naXRodWJDbGllbnQucXVlcnk8R2V0RGlzY3Vzc2lvbkNvbW1lbnRDb3VudFF1ZXJ5LCBHZXREaXNjdXNzaW9uQ29tbWVudENvdW50UXVlcnlWYXJpYWJsZXM+KHtcbiAgICAgIHF1ZXJ5OiBHZXREaXNjdXNzaW9uQ29tbWVudENvdW50LFxuICAgICAgdmFyaWFibGVzOiB7XG4gICAgICAgIG93bmVyOiB0aGlzLm93bmVyLFxuICAgICAgICBuYW1lOiB0aGlzLnJlcG8sXG4gICAgICAgIG51bTogZGlzY3Vzc2lvbk51bVxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChyZXN1bHQuZXJyb3IpIHtcbiAgICAgIGNvcmUud2FybmluZyhgRXJyb3IgcmV0cmlldmluZyBjb21tZW50IGNvdW50IGZvciBkaXNjdXNzaW9uICR7ZGlzY3Vzc2lvbk51bX06ICR7cmVzdWx0LmVycm9yfWApO1xuICAgICAgcmV0dXJuIDA7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdC5kYXRhLnJlcG9zaXRvcnk/LmRpc2N1c3Npb24/LmNvbW1lbnRzLnRvdGFsQ291bnQhO1xuICB9XG5cbiAgcHVibGljIGFzeW5jIGdldENvbW1lbnRzTWV0YURhdGEoZGlzY3Vzc2lvbk51bTogbnVtYmVyLCBjb21tZW50Q291bnQ6IG51bWJlcik6IFByb21pc2U8RGlzY3Vzc2lvbkNvbW1lbnRDb25uZWN0aW9uPiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5naXRodWJDbGllbnQucXVlcnk8R2V0Q29tbWVudE1ldGFEYXRhUXVlcnksIEdldENvbW1lbnRNZXRhRGF0YVF1ZXJ5VmFyaWFibGVzPih7XG4gICAgICBxdWVyeTogR2V0Q29tbWVudE1ldGFEYXRhLFxuICAgICAgdmFyaWFibGVzOiB7XG4gICAgICAgIG93bmVyOiB0aGlzLm93bmVyLFxuICAgICAgICBuYW1lOiB0aGlzLnJlcG8sXG4gICAgICAgIGRpc2N1c3Npb25OdW1iZXI6IGRpc2N1c3Npb25OdW0sXG4gICAgICAgIGNvbW1lbnRDb3VudDogY29tbWVudENvdW50LFxuICAgICAgfSxcbiAgICB9KVxuXG4gICAgaWYgKHJlc3VsdC5lcnJvcikge1xuICAgICAgY29yZS53YXJuaW5nKGBFcnJvciByZXRyaWV2aW5nIGNvbW1lbnQgbWV0YWRhdGEgZm9yIGRpc2N1c3Npb24gJHtkaXNjdXNzaW9uTnVtfTogJHtyZXN1bHQuZXJyb3J9YCk7XG4gICAgICByZXR1cm4ge30gYXMgRGlzY3Vzc2lvbkNvbW1lbnRDb25uZWN0aW9uO1xuICAgIH1cblxuICAgIHJldHVybiByZXN1bHQuZGF0YS5yZXBvc2l0b3J5Py5kaXNjdXNzaW9uPy5jb21tZW50cyBhcyBEaXNjdXNzaW9uQ29tbWVudENvbm5lY3Rpb247XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZ2V0RGlzY3Vzc2lvbnNNZXRhRGF0YShjYXRlZ29yeUlEOiBzdHJpbmcsIHBhZ2VTaXplOiBudW1iZXIsIGFmdGVyQ3Vyc29yOiBzdHJpbmcpOiBQcm9taXNlPERpc2N1c3Npb25Db25uZWN0aW9uPiB7XG4gICAgY29uc3QgZGlzY3Vzc2lvbnNDb3VudCA9IGF3YWl0IHRoaXMuZ2V0VG90YWxEaXNjdXNzaW9uQ291bnQoY2F0ZWdvcnlJRCk7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5naXRodWJDbGllbnQucXVlcnk8R2V0RGlzY3Vzc2lvbkRhdGFRdWVyeSwgR2V0RGlzY3Vzc2lvbkRhdGFRdWVyeVZhcmlhYmxlcz4oe1xuICAgICAgcXVlcnk6IEdldERpc2N1c3Npb25EYXRhLFxuICAgICAgdmFyaWFibGVzOiB7XG4gICAgICAgIG93bmVyOiB0aGlzLm93bmVyLFxuICAgICAgICBuYW1lOiB0aGlzLnJlcG8sXG4gICAgICAgIGNhdGVnb3J5SUQ6IGNhdGVnb3J5SUQsXG4gICAgICAgIHBhZ2VTaXplOiBwYWdlU2l6ZSxcbiAgICAgICAgYWZ0ZXI6IGFmdGVyQ3Vyc29yLFxuICAgICAgfSxcbiAgICB9KVxuXG4gICAgaWYgKHJlc3VsdC5lcnJvcikge1xuICAgICAgY29yZS53YXJuaW5nKGBFcnJvciByZXRyaWV2aW5nIGRpc2N1c3Npb25zIG1ldGFkYXRhIGZvciBjYXRlZ29yeSAke2NhdGVnb3J5SUR9OiAke3Jlc3VsdC5lcnJvcn1gKTtcbiAgICAgIHJldHVybiB7fSBhcyBEaXNjdXNzaW9uQ29ubmVjdGlvbjtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVzdWx0LmRhdGEucmVwb3NpdG9yeT8uZGlzY3Vzc2lvbnMgYXMgRGlzY3Vzc2lvbkNvbm5lY3Rpb247XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZ2V0QW5zd2VyYWJsZURpc2N1c3Npb25DYXRlZ29yeUlEcygpOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZ2l0aHViQ2xpZW50LnF1ZXJ5PEdldEFuc3dlcmFibGVEaXNjdXNzaW9uSWRRdWVyeSwgR2V0QW5zd2VyYWJsZURpc2N1c3Npb25JZFF1ZXJ5VmFyaWFibGVzPih7XG4gICAgICBxdWVyeTogR2V0QW5zd2VyYWJsZURpc2N1c3Npb25JZCxcbiAgICAgIHZhcmlhYmxlczoge1xuICAgICAgICBvd25lcjogdGhpcy5vd25lcixcbiAgICAgICAgbmFtZTogdGhpcy5yZXBvXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKCFyZXN1bHQuZGF0YS5yZXBvc2l0b3J5KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYENvdWxkbid0IGZpbmQgcmVwb3NpdG9yeSAke3RoaXMucmVwb30gaW4gb3duZXIgJHt0aGlzLm93bmVyfWApO1xuICAgIH1cblxuICAgIGNvbnN0IGFuc3dlcmFibGVDYXRlZ29yeUlEczogc3RyaW5nW10gPSBbXTtcbiAgICByZXN1bHQuZGF0YS5yZXBvc2l0b3J5LmRpc2N1c3Npb25DYXRlZ29yaWVzLmVkZ2VzPy5mb3JFYWNoKGVsZW1lbnQgPT4ge1xuICAgICAgaWYgKGVsZW1lbnQ/Lm5vZGU/LmlzQW5zd2VyYWJsZSA9PSB0cnVlKSB7XG4gICAgICAgIGFuc3dlcmFibGVDYXRlZ29yeUlEcy5wdXNoKGVsZW1lbnQ/Lm5vZGU/LmlkKTtcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgaWYgKCFhbnN3ZXJhYmxlQ2F0ZWdvcnlJRHMubGVuZ3RoKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZXJlIGFyZSBubyBhbnN3ZXJhYmxlIGRpc2N1c3Npb24gY2F0ZWdvcmllcyBpbiB0aGlzIHJlcG9zaXRvcnksIHRoaXMgR2l0SHViIEFjdGlvbiBvbmx5IHdvcmtzIG9uIGFuc3dlcmFibGUgZGlzY3Vzc2lvbiBjYXRlZ29yaWVzLicpO1xuICAgIH1cblxuICAgIHJldHVybiBhbnN3ZXJhYmxlQ2F0ZWdvcnlJRHM7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgY2xvc2VEaXNjdXNzaW9uQXNSZXNvbHZlZChkaXNjdXNzaW9uSWQ6IHN0cmluZykge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZ2l0aHViQ2xpZW50Lm11dGF0ZTxDbG9zZURpc2N1c3Npb25Bc1Jlc29sdmVkTXV0YXRpb24sIENsb3NlRGlzY3Vzc2lvbkFzUmVzb2x2ZWRNdXRhdGlvblZhcmlhYmxlcz4oe1xuICAgICAgbXV0YXRpb246IENsb3NlRGlzY3Vzc2lvbkFzUmVzb2x2ZWQsXG4gICAgICB2YXJpYWJsZXM6IHtcbiAgICAgICAgZGlzY3Vzc2lvbklkXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBpZiAocmVzdWx0LmVycm9ycykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBFcnJvciBjbG9zaW5nIGRpc2N1c3Npb24gJHtkaXNjdXNzaW9uSWR9IGFzIHJlc29sdmVkOiAke3Jlc3VsdC5lcnJvcnN9YCk7XG4gICAgfVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGNsb3NlRGlzY3Vzc2lvbkFzT3V0ZGF0ZWQoZGlzY3Vzc2lvbklkOiBzdHJpbmcpIHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmdpdGh1YkNsaWVudC5tdXRhdGU8Q2xvc2VEaXNjdXNzaW9uQXNPdXRkYXRlZE11dGF0aW9uLCBDbG9zZURpc2N1c3Npb25Bc091dGRhdGVkTXV0YXRpb25WYXJpYWJsZXM+KHtcbiAgICAgIG11dGF0aW9uOiBDbG9zZURpc2N1c3Npb25Bc091dGRhdGVkLFxuICAgICAgdmFyaWFibGVzOiB7XG4gICAgICAgIGRpc2N1c3Npb25JZFxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgaWYgKHJlc3VsdC5lcnJvcnMpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgRXJyb3IgY2xvc2luZyBvdXRkYXRlZCBkaXNjdXNzaW9uICR7ZGlzY3Vzc2lvbklkfTogJHtyZXN1bHQuZXJyb3JzfWApO1xuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBhZGRDb21tZW50VG9EaXNjdXNzaW9uKGRpc2N1c3Npb25JZDogc3RyaW5nLCBib2R5OiBzdHJpbmcpIHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmdpdGh1YkNsaWVudC5tdXRhdGU8QWRkRGlzY3Vzc2lvbkNvbW1lbnRNdXRhdGlvbiwgQWRkRGlzY3Vzc2lvbkNvbW1lbnRNdXRhdGlvblZhcmlhYmxlcz4oe1xuICAgICAgbXV0YXRpb246IEFkZERpc2N1c3Npb25Db21tZW50LFxuICAgICAgdmFyaWFibGVzOiB7XG4gICAgICAgIGJvZHksXG4gICAgICAgIGRpc2N1c3Npb25JZFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChyZXN1bHQuZXJyb3JzKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYEVycm9yIGFkZGluZyBjb21tZW50IHRvIGRpc2N1c3Npb24gJHtkaXNjdXNzaW9uSWR9OiAke3Jlc3VsdC5lcnJvcnN9YCk7XG4gICAgfVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGFkZEluc3RydWN0aW9uVGV4dFJlcGx5KGJvZHk6IHN0cmluZywgZGlzY3Vzc2lvbklkOiBzdHJpbmcsIHJlcGx5VG9JZDogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5naXRodWJDbGllbnQubXV0YXRlPEFkZEluc3RydWN0aW9uVGV4dFJlcGx5TXV0YXRpb24sIEFkZEluc3RydWN0aW9uVGV4dFJlcGx5TXV0YXRpb25WYXJpYWJsZXM+KHtcbiAgICAgIG11dGF0aW9uOiBBZGRJbnN0cnVjdGlvblRleHRSZXBseSxcbiAgICAgIHZhcmlhYmxlczoge1xuICAgICAgICBib2R5LFxuICAgICAgICBkaXNjdXNzaW9uSWQsXG4gICAgICAgIHJlcGx5VG9JZFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChyZXN1bHQuZXJyb3JzKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYEVycm9yIGFkZGluZyBJbnN0cnVjdGlvbiB0ZXh0IHRvIGRpc2N1c3Npb24gJHtkaXNjdXNzaW9uSWR9OiAke3Jlc3VsdC5lcnJvcnN9YCk7XG4gICAgfVxuICB9XG5cbiAgcHVibGljIGFzeW5jIG1hcmtEaXNjdXNzaW9uQ29tbWVudEFzQW5zd2VyKGNvbW1lbnRJZDogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5naXRodWJDbGllbnQubXV0YXRlPE1hcmtEaXNjdXNzaW9uQ29tbWVudEFzQW5zd2VyTXV0YXRpb24sIE1hcmtEaXNjdXNzaW9uQ29tbWVudEFzQW5zd2VyTXV0YXRpb25WYXJpYWJsZXM+KHtcbiAgICAgIG11dGF0aW9uOiBNYXJrRGlzY3Vzc2lvbkNvbW1lbnRBc0Fuc3dlcixcbiAgICAgIHZhcmlhYmxlczoge1xuICAgICAgICBjb21tZW50SWRcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGlmIChyZXN1bHQuZXJyb3JzKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYEVycm9yIG1hcmtpbmcgY29tbWVudCAke2NvbW1lbnRJZH0gYXMgYW5zd2VyOiAke3Jlc3VsdC5lcnJvcnN9YCk7XG4gICAgfVxuICB9XG5cbiAgcHVibGljIGFzeW5jIGFkZEF0dGVudGlvbkxhYmVsVG9EaXNjdXNzaW9uKGRpc2N1c3Npb25JZDogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5naXRodWJDbGllbnQubXV0YXRlPEFkZExhYmVsVG9EaXNjdXNzaW9uTXV0YXRpb24sIEFkZExhYmVsVG9EaXNjdXNzaW9uTXV0YXRpb25WYXJpYWJsZXM+KHtcbiAgICAgIG11dGF0aW9uOiBBZGRMYWJlbFRvRGlzY3Vzc2lvbixcbiAgICAgIHZhcmlhYmxlczoge1xuICAgICAgICBsYWJlbGFibGVJZDogZGlzY3Vzc2lvbklkLFxuICAgICAgICBsYWJlbElkczogdGhpcy5hdHRlbnRpb25MYWJlbElkLFxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgaWYgKHJlc3VsdC5lcnJvcnMpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgRXJyb3IgYWRkaW5nIGxhYmVsIHRvIGRpc2N1c3Npb24gJHtkaXNjdXNzaW9uSWR9OiAke3Jlc3VsdC5lcnJvcnN9YCk7XG4gICAgfVxuICB9XG5cbiAgcHVibGljIGFzeW5jIHVwZGF0ZURpc2N1c3Npb25Db21tZW50KGNvbW1lbnRJZDogc3RyaW5nLCBib2R5OiBzdHJpbmcpIHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmdpdGh1YkNsaWVudC5tdXRhdGU8VXBkYXRlRGlzY3Vzc2lvbkNvbW1lbnRNdXRhdGlvbiwgVXBkYXRlRGlzY3Vzc2lvbkNvbW1lbnRNdXRhdGlvblZhcmlhYmxlcz4oe1xuICAgICAgbXV0YXRpb246IFVwZGF0ZURpc2N1c3Npb25Db21tZW50LFxuICAgICAgdmFyaWFibGVzOiB7XG4gICAgICAgIGNvbW1lbnRJZCxcbiAgICAgICAgYm9keVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgaWYgKHJlc3VsdC5lcnJvcnMpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgRXJyb3IgdXBkYXRpbmcgZGlzY3Vzc2lvbiBjb21tZW50ICR7Y29tbWVudElkfTogJHtyZXN1bHQuZXJyb3JzfWApO1xuICAgIH1cbiAgfVxufVxuIl19