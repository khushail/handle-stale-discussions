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
        const discussions = await this.githubClient.query({
            query: graphql_1.GetDiscussionData,
            variables: {
                owner: this.owner,
                name: this.repo,
                categoryID: categoryID,
                count: discussionsCount,
            },
        });
        if (discussions.error) {
            throw new Error("Error in retrieving discussions metadata");
        }
        //iterate over each discussion to process body text/comments/reactions
        return discussions.data.repository?.discussions;
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
}
exports.GithubDiscussionClient = GithubDiscussionClient;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiR2l0aHViRGlzY3Vzc2lvbkNsaWVudC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9HaXRodWJEaXNjdXNzaW9uQ2xpZW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLDhDQUFtRztBQUNuRyxzQ0FBc0M7QUFDdEMsNkNBQWdDO0FBRWhDLGlEQUFzckI7QUFFdHJCLE1BQWEsc0JBQXNCO0lBT2pDLFlBQVksS0FBYSxFQUFFLElBQVk7UUFDckMsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7UUFDbkIsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7UUFDakIsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxjQUFjLEVBQUUsRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLENBQUMsSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQztRQUNuRyxJQUFJLENBQUMsV0FBVyxFQUFFO1lBQ2hCLE1BQU0sSUFBSSxLQUFLLENBQUMsZ0lBQWdJLENBQUMsQ0FBQztTQUNuSjthQUFNO1lBQ0wsSUFBSSxDQUFDLFdBQVcsR0FBRyxXQUFXLENBQUM7U0FDaEM7UUFFRCxJQUFJLENBQUMsMEJBQTBCLEVBQUUsQ0FBQztJQUNwQyxDQUFDO0lBRUQsSUFBSSxZQUFZO1FBQ2QsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUU7WUFDdkIsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLG1CQUFZLENBQUM7Z0JBQ3BDLElBQUksRUFBRSxJQUFJLGVBQVEsQ0FBQztvQkFDakIsR0FBRyxFQUFFLGdDQUFnQztvQkFDckMsT0FBTyxFQUFFO3dCQUNQLGFBQWEsRUFBRSxTQUFTLElBQUksQ0FBQyxXQUFXLEVBQUU7cUJBQzNDO29CQUNELEtBQUssRUFBTCxxQkFBSztpQkFDTixDQUFDO2dCQUNGLEtBQUssRUFBRSxJQUFJLG9CQUFhLEVBQUU7YUFDM0IsQ0FBQyxDQUFDO1NBQ0o7UUFDRCxPQUFPLElBQUks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QUM7SUFFRCxLQUFLLENBQUMsNkJBQTZCLENBQUMsWUFBb0I7UUFDdEQsSUFBSSxZQUFZLEtBQUssRUFBRSxFQUFFO1lBQ3ZCLE1BQU0sSUFBSSxLQUFLLENBQUMseUNBQXlDLENBQUMsQ0FBQztTQUM1RDtRQUVELE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQStCO1lBQzFFLFFBQVEsRUFBRSw4QkFBb0I7WUFDOUIsU0FBUyxFQUFFO2dCQUNULFdBQVcsRUFBRSxZQUFZO2dCQUN6QixRQUFRLEVBQUUsSUFBSSxDQUFDLGdCQUFnQjthQUNoQztTQUNGLENBQUMsQ0FBQztRQUVILElBQUksTUFBTSxDQUFDLE1BQU0sRUFBRTtZQUNqQixNQUFNLElBQUksS0FBSyxDQUFDLG1FQUFtRSxDQUFDLENBQUM7U0FDdEY7UUFFRCxPQUFPLE1BQU0sQ0FBQztJQUNoQixDQUFDO0lBRUQsS0FBSyxDQUFDLHVCQUF1QixDQUFDLFNBQWlCLEVBQUUsSUFBWTtRQUMzRCxNQUFNLE1BQU0sR0FBRyxNQUFNLElBQUksQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFrQztZQUM3RSxRQUFRLEVBQUUsaUNBQXVCO1lBQ2pDLFNBQVMsRUFBRTtnQkFDVCxTQUFTO2dCQUNULElBQUk7YUFDTDtTQUNGLENBQUMsQ0FBQztRQUVILElBQUksTUFBTSxDQUFDLE1BQU0sRUFBRTtZQUNqQixNQUFNLElBQUksS0FBSyxDQUFDLHNDQUFzQyxDQUFDLENBQUM7U0FDekQ7UUFFRCxPQUFPLE1BQU0sQ0FBQztJQUNoQixDQUFDO0NBQ0Y7QUEvTkQsd0RBK05DIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQXBvbGxvQ2xpZW50LCBIdHRwTGluaywgSW5NZW1vcnlDYWNoZSwgTm9ybWFsaXplZENhY2hlT2JqZWN0IH0gZnJvbSBcIkBhcG9sbG8vY2xpZW50L2NvcmVcIjtcbmltcG9ydCAqIGFzIGNvcmUgZnJvbSAnQGFjdGlvbnMvY29yZSc7XG5pbXBvcnQgZmV0Y2ggZnJvbSAnY3Jvc3MtZmV0Y2gnO1xuaW1wb3J0IHsgRGlzY3Vzc2lvbkNvbm5lY3Rpb24gfSBmcm9tIFwiQG9jdG9raXQvZ3JhcGhxbC1zY2hlbWFcIjtcbmltcG9ydCB7IEdldERpc2N1c3Npb25Db3VudFF1ZXJ5LCBHZXREaXNjdXNzaW9uQ291bnRRdWVyeVZhcmlhYmxlcywgR2V0RGlzY3Vzc2lvbkNvdW50LCBHZXREaXNjdXNzaW9uRGF0YVF1ZXJ5LCBHZXREaXNjdXNzaW9uRGF0YVF1ZXJ5VmFyaWFibGVzLCBHZXREaXNjdXNzaW9uRGF0YSwgR2V0QW5zd2VyYWJsZURpc2N1c3Npb25JZFF1ZXJ5LCBHZXRBbnN3ZXJhYmxlRGlzY3Vzc2lvbklkUXVlcnlWYXJpYWJsZXMsIEdldEFuc3dlcmFibGVEaXNjdXNzaW9uSWQsIEdldExhYmVsSWRRdWVyeSwgR2V0TGFiZWxJZCwgQ2xvc2VEaXNjdXNzaW9uQXNSZXNvbHZlZE11dGF0aW9uLCBDbG9zZURpc2N1c3Npb25Bc1Jlc29sdmVkLCBDbG9zZURpc2N1c3Npb25Bc091dGRhdGVkTXV0YXRpb24sIENsb3NlRGlzY3Vzc2lvbkFzT3V0ZGF0ZWQsIEFkZERpc2N1c3Npb25Db21tZW50TXV0YXRpb24sIEFkZERpc2N1c3Npb25Db21tZW50LCBNYXJrRGlzY3Vzc2lvbkNvbW1lbnRBc0Fuc3dlck11dGF0aW9uLCBNYXJrRGlzY3Vzc2lvbkNvbW1lbnRBc0Fuc3dlciwgQWRkTGFiZWxUb0Rpc2N1c3Npb25NdXRhdGlvbiwgQWRkTGFiZWxUb0Rpc2N1c3Npb24sIFVwZGF0ZURpc2N1c3Npb25Db21tZW50TXV0YXRpb24sIFVwZGF0ZURpc2N1c3Npb25Db21tZW50LCBSZWFjdGlvbkNvbnRlbnQgfSBmcm9tIFwiLi9nZW5lcmF0ZWQvZ3JhcGhxbFwiO1xuXG5leHBvcnQgY2xhc3MgR2l0aHViRGlzY3Vzc2lvbkNsaWVudCB7XG4gIHByaXZhdGUgX2dpdGh1YkNsaWVudDogQXBvbGxvQ2xpZW50PE5vcm1hbGl6ZWRDYWNoZU9iamVjdD47XG4gIHByaXZhdGUgZ2l0aHViVG9rZW46IHN0cmluZztcbiAgcHJpdmF0ZSBvd25lcjogc3RyaW5nO1xuICBwcml2YXRlIHJlcG86IHN0cmluZztcbiAgcHJpdmF0ZSBhdHRlbnRpb25MYWJlbElkOiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3Iob3duZXI6IHN0cmluZywgcmVwbzogc3RyaW5nKSB7XG4gICAgdGhpcy5vd25lciA9IG93bmVyO1xuICAgIHRoaXMucmVwbyA9IHJlcG87XG4gICAgY29uc3QgZ2l0aHViVG9rZW4gPSBjb3JlLmdldElucHV0KCdnaXRodWItdG9rZW4nLCB7IHJlcXVpcmVkOiBmYWxzZSB9KSB8fCBwcm9jZXNzLmVudi5HSVRIVUJfVE9LRU47XG4gICAgaWYgKCFnaXRodWJUb2tlbikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdZb3UgbXVzdCBwcm92aWRlIGEgR2l0SHViIHRva2VuIGFzIGFuIGlucHV0IHRvIHRoaXMgYWN0aW9uLCBvciBhcyBhIGBHSVRIVUJfVE9LRU5gIGVudiB2YXJpYWJsZS4gU2VlIHRoZSBSRUFETUUgZm9yIG1vcmUgaW5mby4nKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5naXRodWJUb2tlbiA9IGdpdGh1YlRva2VuO1xuICAgIH1cblxuICAgIHRoaXMuaW5pdGlhbGl6ZUF0dGVudGlvbkxhYmVsSWQoKTtcbiAgfVxuXG4gIGdldCBnaXRodWJDbGllbnQoKTogQXBvbGxvQ2xpZW50PE5vcm1hbGl6ZWRDYWNoZU9iamVjdD4ge1xuICAgIGlmICghdGhpcy5fZ2l0aHViQ2xpZW50KSB7XG4gICAgICB0aGlzLl9naXRodWJDbGllbnQgPSBuZXcgQXBvbGxvQ2xpZW50KHtcbiAgICAgICAgbGluazogbmV3IEh0dHBMaW5rKHtcbiAgICAgICAgICB1cmk6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9ncmFwaHFsXCIsXG4gICAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICAgYXV0aG9yaXphdGlvbjogYHRva2VuICR7dGhpcy5naXRodWJUb2tlbn1gLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgZmV0Y2hcbiAgICAgICAgfSksXG4gICAgICAgIGNhY2hlOiBuZXcgSW5NZW1vcnlDYWNoZSgpLFxuICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLl9naXRodWJDbGllbnQ7XG4gIH1cblxuICBhc3luYyBpbml0aWFsaXplQXR0ZW50aW9uTGFiZWxJZCgpIHtcbiAgICBpZiAoIXRoaXMuYXR0ZW50aW9uTGFiZWxJZCkge1xuICAgICAgY29uc3QgYXR0ZW50aW9uTGFiZWwgPSBjb3JlLmdldElucHV0KCdhdHRlbnRpb24tbGFiZWwnLCB7IHJlcXVpcmVkOiBmYWxzZSB9KSB8fCAnYXR0ZW50aW9uJztcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZ2l0aHViQ2xpZW50LnF1ZXJ5PEdldExhYmVsSWRRdWVyeT4oe1xuICAgICAgICBxdWVyeTogR2V0TGFiZWxJZCxcbiAgICAgICAgdmFyaWFibGVzOiB7XG4gICAgICAgICAgb3duZXI6IHRoaXMub3duZXIsXG4gICAgICAgICAgbmFtZTogdGhpcy5yZXBvLFxuICAgICAgICAgIGxhYmVsTmFtZTogYXR0ZW50aW9uTGFiZWxcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgXG4gICAgICBpZiAoIXJlc3VsdC5kYXRhLnJlcG9zaXRvcnk/LmxhYmVsPy5pZCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYENvdWxkbid0IGZpbmQgbWVudGlvbmVkIExhYmVsIWApO1xuICAgICAgfVxuXG4gICAgICB0aGlzLmF0dGVudGlvbkxhYmVsSWQgPSByZXN1bHQuZGF0YS5yZXBvc2l0b3J5Py5sYWJlbD8uaWQ7XG4gICAgICByZXR1cm4gdGhpcy5hdHRlbnRpb25MYWJlbElkO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gdGhpcy5hdHRlbnRpb25MYWJlbElkO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGdldFRvdGFsRGlzY3Vzc2lvbkNvdW50KGNhdGVnb3J5SUQ6IHN0cmluZykge1xuICAgIGNvbnN0IHJlc3VsdENvdW50T2JqZWN0ID0gYXdhaXQgdGhpcy5naXRodWJDbGllbnQucXVlcnk8R2V0RGlzY3Vzc2lvbkNvdW50UXVlcnksIEdldERpc2N1c3Npb25Db3VudFF1ZXJ5VmFyaWFibGVzPih7XG4gICAgICBxdWVyeTogR2V0RGlzY3Vzc2lvbkNvdW50LFxuICAgICAgdmFyaWFibGVzOiB7XG4gICAgICAgIG93bmVyOiB0aGlzLm93bmVyLFxuICAgICAgICBuYW1lOiB0aGlzLnJlcG8sXG4gICAgICAgIGNhdGVnb3J5SWQ6IGNhdGVnb3J5SURcbiAgICAgIH0sXG4gICAgfSk7XG4gIFxuICAgIGlmIChyZXN1bHRDb3VudE9iamVjdC5lcnJvcikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRXJyb3IgaW4gcmVhZGluZyBkaXNjdXNzaW9ucyBjb3VudFwiKTtcbiAgICB9XG4gIFxuICAgIGNvcmUuZGVidWcoYFRvdGFsIGRpc2N1c3Npb24gY291bnQgOiAke3Jlc3VsdENvdW50T2JqZWN0LmRhdGEucmVwb3NpdG9yeT8uZGlzY3Vzc2lvbnMudG90YWxDb3VudH1gKTtcbiAgICByZXR1cm4gcmVzdWx0Q291bnRPYmplY3QuZGF0YS5yZXBvc2l0b3J5Py5kaXNjdXNzaW9ucy50b3RhbENvdW50O1xuICB9XG5cbiAgYXN5bmMgZ2V0RGlzY3Vzc2lvbnNNZXRhRGF0YShjYXRlZ29yeUlEOiBzdHJpbmcpOiBQcm9taXNlPERpc2N1c3Npb25Db25uZWN0aW9uPiB7XG4gICAgY29uc3QgZGlzY3Vzc2lvbnNDb3VudCA9IGF3YWl0IHRoaXMuZ2V0VG90YWxEaXNjdXNzaW9uQ291bnQoY2F0ZWdvcnlJRCk7XG4gIFxuICAgIGNvbnN0IGRpc2N1c3Npb25zID0gYXdhaXQgdGhpcy5naXRodWJDbGllbnQucXVlcnk8R2V0RGlzY3Vzc2lvbkRhdGFRdWVyeSwgR2V0RGlzY3Vzc2lvbkRhdGFRdWVyeVZhcmlhYmxlcz4oe1xuICAgICAgcXVlcnk6IEdldERpc2N1c3Npb25EYXRhLFxuICAgICAgdmFyaWFibGVzOiB7XG4gICAgICAgIG93bmVyOiB0aGlzLm93bmVyLFxuICAgICAgICBuYW1lOiB0aGlzLnJlcG8sXG4gICAgICAgIGNhdGVnb3J5SUQ6IGNhdGVnb3J5SUQsXG4gICAgICAgIGNvdW50OiBkaXNjdXNzaW9uc0NvdW50LFxuICAgICAgfSxcbiAgICB9KVxuICBcbiAgICBpZiAoZGlzY3Vzc2lvbnMuZXJyb3IpIHsgdGhyb3cgbmV3IEVycm9yKFwiRXJyb3IgaW4gcmV0cmlldmluZyBkaXNjdXNzaW9ucyBtZXRhZGF0YVwiKTsgfVxuICBcbiAgICAvL2l0ZXJhdGUgb3ZlciBlYWNoIGRpc2N1c3Npb24gdG8gcHJvY2VzcyBib2R5IHRleHQvY29tbWVudHMvcmVhY3Rpb25zXG4gICAgcmV0dXJuIGRpc2N1c3Npb25zLmRhdGEucmVwb3NpdG9yeT8uZGlzY3Vzc2lvbnMgYXMgRGlzY3Vzc2lvbkNvbm5lY3Rpb247XG4gIH1cblxuICBhc3luYyBnZXRBbnN3ZXJhYmxlRGlzY3Vzc2lvbkNhdGVnb3J5SURzKCk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3QgYW5zd2VyYWJsZUNhdGVnb3J5SURzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZ2l0aHViQ2xpZW50LnF1ZXJ5PEdldEFuc3dlcmFibGVEaXNjdXNzaW9uSWRRdWVyeSwgR2V0QW5zd2VyYWJsZURpc2N1c3Npb25JZFF1ZXJ5VmFyaWFibGVzPih7XG4gICAgICBxdWVyeTogR2V0QW5zd2VyYWJsZURpc2N1c3Npb25JZCxcbiAgICAgIHZhcmlhYmxlczoge1xuICAgICAgICBvd25lcjogdGhpcy5vd25lcixcbiAgICAgICAgbmFtZTogdGhpcy5yZXBvXG4gICAgICB9LFxuICAgIH0pO1xuICBcbiAgICBpZiAoIXJlc3VsdC5kYXRhLnJlcG9zaXRvcnkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgQ291bGRuJ3QgZmluZCByZXBvc2l0b3J5IGlkIWApO1xuICAgIH1cbiAgXG4gICAgLy9pdGVyYXRlIG92ZXIgZGlzY3Vzc2lvbiBjYXRlZ29yaWVzIHRvIGdldCB0aGUgaWQgZm9yIGFuc3dlcmFibGUgb25lXG4gICAgcmVzdWx0LmRhdGEucmVwb3NpdG9yeS5kaXNjdXNzaW9uQ2F0ZWdvcmllcy5lZGdlcz8uZm9yRWFjaChlbGVtZW50ID0+IHtcbiAgICAgIGlmIChlbGVtZW50Py5ub2RlPy5pc0Fuc3dlcmFibGUgPT0gdHJ1ZSkge1xuICAgICAgICBhbnN3ZXJhYmxlQ2F0ZWdvcnlJRHMucHVzaChlbGVtZW50Py5ub2RlPy5pZCk7XG4gICAgICB9XG4gICAgfSlcbiAgXG4gICAgaWYgKGFuc3dlcmFibGVDYXRlZ29yeUlEcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlRoZXJlIGFyZSBubyBBbnN3ZXJhYmxlIGNhdGVnb3J5IGRpc2N1c3Npb25zIGluIHRoaXMgcmVwb3NpdG9yeVwiKTtcbiAgICB9XG4gIFxuICAgIHJldHVybiBhbnN3ZXJhYmxlQ2F0ZWdvcnlJRHM7XG4gIH1cblxuICBhc3luYyBjbG9zZURpc2N1c3Npb25Bc1Jlc29sdmVkKGRpc2N1c3Npb25JZDogc3RyaW5nKSB7XG4gICAgY29yZS5pbmZvKFwiQ2xvc2luZyBkaXNjdXNzaW9uIGFzIHJlc29sdmVkXCIpO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZ2l0aHViQ2xpZW50Lm11dGF0ZTxDbG9zZURpc2N1c3Npb25Bc1Jlc29sdmVkTXV0YXRpb24+KHtcbiAgICAgIG11dGF0aW9uOiBDbG9zZURpc2N1c3Npb25Bc1Jlc29sdmVkLFxuICAgICAgdmFyaWFibGVzOiB7XG4gICAgICAgIGRpc2N1c3Npb25JZFxuICAgICAgfVxuICAgIH0pO1xuICBcbiAgICBpZiAocmVzdWx0LmVycm9ycykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRXJyb3IgaW4gcmV0cmlldmluZyByZXN1bHQgZGlzY3Vzc2lvbiBpZFwiKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVzdWx0LmRhdGE/LmNsb3NlRGlzY3Vzc2lvbj8uZGlzY3Vzc2lvbj8uaWQ7XG4gIH1cblxuICBhc3luYyBjbG9zZURpc2N1c3Npb25Bc091dGRhdGVkKGRpc2N1c3Npb25JZDogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5naXRodWJDbGllbnQubXV0YXRlPENsb3NlRGlzY3Vzc2lvbkFzT3V0ZGF0ZWRNdXRhdGlvbj4oe1xuICAgICAgbXV0YXRpb246IENsb3NlRGlzY3Vzc2lvbkFzT3V0ZGF0ZWQsXG4gICAgICB2YXJpYWJsZXM6IHtcbiAgICAgICAgZGlzY3Vzc2lvbklkXG4gICAgICB9XG4gICAgfSk7XG4gIFxuICAgIGlmIChyZXN1bHQuZXJyb3JzKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJFcnJvciBpbiBjbG9zaW5nIG91dGRhdGVkIGRpc2N1c3Npb25cIik7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdC5kYXRhPy5jbG9zZURpc2N1c3Npb24/LmRpc2N1c3Npb24/LmlkO1xuICB9XG5cbiAgYXN5bmMgYWRkQ29tbWVudFRvRGlzY3Vzc2lvbihkaXNjdXNzaW9uSWQ6IHN0cmluZywgYm9keTogc3RyaW5nKSB7XG4gICAgaWYgKGRpc2N1c3Npb25JZCA9PT0gXCJcIikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBDb3VsZG4ndCBjcmVhdGUgY29tbWVudCBhcyBkaXNjdXNzaW9uSWQgaXMgbnVsbCFgKTtcbiAgICB9XG5cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmdpdGh1YkNsaWVudC5tdXRhdGU8QWRkRGlzY3Vzc2lvbkNvbW1lbnRNdXRhdGlvbj4oe1xuICAgICAgbXV0YXRpb246IEFkZERpc2N1c3Npb25Db21tZW50LFxuICAgICAgdmFyaWFibGVzOiB7XG4gICAgICAgIGRpc2N1c3Npb25JZCxcbiAgICAgICAgYm9keSxcbiAgICAgIH0sXG4gICAgfSk7XG4gIFxuICAgIGlmIChyZXN1bHQuZXJyb3JzKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJNdXRhdGlvbiBhZGRpbmcgY29tbWVudCB0byBkaXNjdXNzaW9uIGZhaWxlZCB3aXRoIGVycm9yXCIpO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIG1hcmtEaXNjdXNzaW9uQ29tbWVudEFzQW5zd2VyKGNvbW1lbnRJZDogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5naXRodWJDbGllbnQubXV0YXRlPE1hcmtEaXNjdXNzaW9uQ29tbWVudEFzQW5zd2VyTXV0YXRpb24+KHtcbiAgICAgIG11dGF0aW9uOiBNYXJrRGlzY3Vzc2lvbkNvbW1lbnRBc0Fuc3dlcixcbiAgICAgIHZhcmlhYmxlczoge1xuICAgICAgICBjb21tZW50SWRcbiAgICAgIH1cbiAgICB9KTtcbiAgXG4gICAgaWYgKHJlc3VsdC5lcnJvcnMpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkVycm9yIGluIG11dGF0aW9uIG9mIG1hcmtpbmcgY29tbWVudCBhcyBhbnN3ZXIsIGNhbiBub3QgcHJvY2VlZFwiKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgYXN5bmMgYWRkQXR0ZW50aW9uTGFiZWxUb0Rpc2N1c3Npb24oZGlzY3Vzc2lvbklkOiBzdHJpbmcpIHtcbiAgICBpZiAoZGlzY3Vzc2lvbklkID09PSBcIlwiKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJJbnZhbGlkIGRpc2N1c3Npb24gaWQsIGNhbiBub3QgcHJvY2VlZCFcIik7XG4gICAgfVxuICBcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmdpdGh1YkNsaWVudC5tdXRhdGU8QWRkTGFiZWxUb0Rpc2N1c3Npb25NdXRhdGlvbj4oe1xuICAgICAgbXV0YXRpb246IEFkZExhYmVsVG9EaXNjdXNzaW9uLFxuICAgICAgdmFyaWFibGVzOiB7XG4gICAgICAgIGxhYmVsYWJsZUlkOiBkaXNjdXNzaW9uSWQsXG4gICAgICAgIGxhYmVsSWRzOiB0aGlzLmF0dGVudGlvbkxhYmVsSWQsXG4gICAgICB9XG4gICAgfSk7XG4gIFxuICAgIGlmIChyZXN1bHQuZXJyb3JzKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJFcnJvciBpbiBtdXRhdGlvbiBvZiBhZGRpbmcgbGFiZWwgdG8gZGlzY3Vzc2lvbiwgY2FuIG5vdCBwcm9jZWVkIVwiKTtcbiAgICB9XG4gIFxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBhc3luYyB1cGRhdGVEaXNjdXNzaW9uQ29tbWVudChjb21tZW50SWQ6IHN0cmluZywgYm9keTogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5naXRodWJDbGllbnQubXV0YXRlPFVwZGF0ZURpc2N1c3Npb25Db21tZW50TXV0YXRpb24+KHtcbiAgICAgIG11dGF0aW9uOiBVcGRhdGVEaXNjdXNzaW9uQ29tbWVudCxcbiAgICAgIHZhcmlhYmxlczoge1xuICAgICAgICBjb21tZW50SWQsXG4gICAgICAgIGJvZHlcbiAgICAgIH1cbiAgICB9KTtcbiAgXG4gICAgaWYgKHJlc3VsdC5lcnJvcnMpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkVycm9yIGluIHVwZGF0aW5nIGRpc2N1c3Npb24gY29tbWVudFwiKTtcbiAgICB9XG4gIFxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cbn1cbiJdfQ==