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
        const discussionIdList = [];
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
                discussionNum: discussionNum,
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
                discussionNum: discussionNum,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiR2l0aHViRGlzY3Vzc2lvbkNsaWVudC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9HaXRodWJEaXNjdXNzaW9uQ2xpZW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLDhDQUFtRztBQUNuRyxzQ0FBc0M7QUFDdEMsNkNBQWdDO0FBRWhDLGlEQUF5Z0M7QUFFemdDLE1BQWEsc0JBQXNCO0lBT2pDLFlBQVksS0FBYSxFQUFFLElBQVk7UUFDckMsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7UUFDbkIsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7UUFDakIsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxjQUFjLEVBQUUsRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLENBQUMsSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQztRQUNuRyxJQUFJLENBQUMsV0FBVyxFQUFFO1lBQ2hCLE1BQU0sSUFBSSxLQUFLLENBQUMsZ0lBQWdJLENBQUMsQ0FBQztTQUNuSjthQUFNO1lBQ0wsSUFBSSxDQUFDLFdBQVcsR0FBRyxXQUFXLENBQUM7U0FDaEM7UUFFRCxJQUFJLENBQUMsMEJBQTBCLEVBQUUsQ0FBQztJQUNwQyxDQUFDO0lBRUQsSUFBSSxZQUFZO1FBQ2QsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUU7WUFDdkIsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLG1CQUFZLENBQUM7Z0JBQ3BDLElBQUksRUFBRSxJQUFJLGVBQVEsQ0FBQztvQkFDakIsR0FBRyxFQUFFLGdDQUFnQztvQkFDckMsT0FBTyxFQUFFO3dCQUNQLGFBQWEsRUFBRSxTQUFTLElBQUksQ0FBQyxXQUFXLEVBQUU7cUJBQzNDO29CQUNELEtBQUssRUFBTCxxQkFBSztpQkFDTixDQUFDO2dCQUNGLEtBQUssRUFBRSxJQUFJLG9CQUFhLEVBQUU7YUFDM0IsQ0FBQyxDQUFDO1NBQ0o7UUFDRCxPQUFPLElBQUks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Tm9ybWFsaXplZENhY2hlT2JqZWN0IH0gZnJvbSBcIkBhcG9sbG8vY2xpZW50L2NvcmVcIjtcbmltcG9ydCAqIGFzIGNvcmUgZnJvbSAnQGFjdGlvbnMvY29yZSc7XG5pbXBvcnQgZmV0Y2ggZnJvbSAnY3Jvc3MtZmV0Y2gnO1xuaW1wb3J0IHsgRGlzY3Vzc2lvbkNvbm5lY3Rpb24gfSBmcm9tIFwiQG9jdG9raXQvZ3JhcGhxbC1zY2hlbWFcIjtcbmltcG9ydCB7IEdldERpc2N1c3Npb25Db3VudFF1ZXJ5LCBHZXREaXNjdXNzaW9uQ291bnRRdWVyeVZhcmlhYmxlcywgR2V0RGlzY3Vzc2lvbkNvdW50LCBHZXREaXNjdXNzaW9uRGF0YVF1ZXJ5LCBHZXREaXNjdXNzaW9uRGF0YVF1ZXJ5VmFyaWFibGVzLCBHZXREaXNjdXNzaW9uRGF0YSwgR2V0QW5zd2VyYWJsZURpc2N1c3Npb25JZFF1ZXJ5LCBHZXRBbnN3ZXJhYmxlRGlzY3Vzc2lvbklkUXVlcnlWYXJpYWJsZXMsIEdldEFuc3dlcmFibGVEaXNjdXNzaW9uSWQsIEdldExhYmVsSWRRdWVyeSwgR2V0TGFiZWxJZCwgQ2xvc2VEaXNjdXNzaW9uQXNSZXNvbHZlZE11dGF0aW9uLCBDbG9zZURpc2N1c3Npb25Bc1Jlc29sdmVkLCBDbG9zZURpc2N1c3Npb25Bc091dGRhdGVkTXV0YXRpb24sIENsb3NlRGlzY3Vzc2lvbkFzT3V0ZGF0ZWQsIEFkZERpc2N1c3Npb25Db21tZW50TXV0YXRpb24sIEFkZERpc2N1c3Npb25Db21tZW50LCBNYXJrRGlzY3Vzc2lvbkNvbW1lbnRBc0Fuc3dlck11dGF0aW9uLCBNYXJrRGlzY3Vzc2lvbkNvbW1lbnRBc0Fuc3dlciwgQWRkTGFiZWxUb0Rpc2N1c3Npb25NdXRhdGlvbiwgQWRkTGFiZWxUb0Rpc2N1c3Npb24sIFVwZGF0ZURpc2N1c3Npb25Db21tZW50TXV0YXRpb24sIFVwZGF0ZURpc2N1c3Npb25Db21tZW50LCBSZWFjdGlvbkNvbnRlbnQsIEdldERpc2N1c3Npb25Db21tZW50Q291bnRRdWVyeSwgR2V0RGlzY3Vzc2lvbkNvbW1lbnRDb3VudCwgR2V0Q29tbWVudFJlYWN0aW9uQ291bnRRdWVyeSwgR2V0Q29tbWVudFJlYWN0aW9uQ291bnQsIEdldENvbW1lbnRSZWFjdGlvbkRhdGFRdWVyeSwgR2V0Q29tbWVudFJlYWN0aW9uRGF0YSwgRGlzY3Vzc2lvbkNvbW1lbnRDb25uZWN0aW9uLCBHZXRDb21tZW50TWV0YURhdGFRdWVyeSwgR2V0Q29tbWVudE1ldGFEYXRhUXVlcnlWYXJpYWJsZXMsIEdldENvbW1lbnRNZXRhRGF0YSwgRGlzY3Vzc2lvbkNvbW1lbnQsIFRlYW1EaXNjdXNzaW9uQ29tbWVudENvbm5lY3Rpb24sIERpc2N1c3Npb24gfSBmcm9tIFwiLi9nZW5lcmF0ZWQvZ3JhcGhxbFwiO1xuXG5leHBvcnQgY2xhc3MgR2l0aHViRGlzY3Vzc2lvbkNsaWVudCB7XG4gIHByaXZhdGUgX2dpdGh1YkNsaWVudDogQXBvbGxvQ2xpZW50PE5vcm1hbGl6ZWRDYWNoZU9iamVjdD47XG4gIHByaXZhdGUgZ2l0aHViVG9rZW46IHN0cmluZztcbiAgcHJpdmF0ZSBvd25lcjogc3RyaW5nO1xuICBwcml2YXRlIHJlcG86IHN0cmluZztcbiAgcHJpdmF0ZSBhdHRlbnRpb25MYWJlbElkOiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3Iob3duZXI6IHN0cmluZywgcmVwbzogc3RyaW5nKSB7XG4gICAgdGhpcy5vd25lciA9IG93bmVyO1xuICAgIHRoaXMucmVwbyA9IHJlcG87XG4gICAgY29uc3QgZ2l0aHViVG9rZW4gPSBjb3JlLmdldElucHV0KCdnaXRodWItdG9rZW4nLCB7IHJlcXVpcmVkOiBmYWxzZSB9KSB8fCBwcm9jZXNzLmVudi5HSVRIVUJfVE9LRU47XG4gICAgaWYgKCFnaXRodWJUb2tlbikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdZb3UgbXVzdCBwcm92aWRlIGEgR2l0SHViIHRva2VuIGFzIGFuIGlucHV0IHRvIHRoaXMgYWN0aW9uLCBvciBhcyBhIGBHSVRIVUJfVE9LRU5gIGVudiB2YXJpYWJsZS4gU2VlIHRoZSBSRUFETUUgZm9yIG1vcmUgaW5mby4nKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5naXRodWJUb2tlbiA9IGdpdGh1YlRva2VuO1xuICAgIH1cblxuICAgIHRoaXMuaW5pdGlhbGl6ZUF0dGVudGlvbkxhYmVsSWQoKTtcbiAgfVxuXG4gIGdldCBnaXRodWJDbGllbnQoKTogQXBvbGxvQ2xpZW50PE5vcm1hbGl6ZWRDYWNoZU9iamVjdD4ge1xuICAgIGlmICghdGhpcy5fZ2l0aHViQ2xpZW50KSB7XG4gICAgICB0aGlzLl9naXRodWJDbGllbnQgPSBuZXcgQXBvbGxvQ2xpZW50KHtcbiAgICAgICAgbGluazogbmV3IEh0dHBMaW5rKHtcbiAgICAgICAgICB1cmk6IFwiaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9ncmFwaHFsXCIsXG4gICAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICAgYXV0aG9yaXphdGlvbjogYHRva2VuICR7dGhpcy5naXRodWJUb2tlbn1gLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgZmV0Y2hcbiAgICAgICAgfSksXG4gICAgICAgIGNhY2hlOiBuZXcgSW5NZW1vcnlDYWNoZSgpLFxuICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLl9naXRodWJDbGllbnQ7XG4gIH1cblxuICBhc3luYyBpbml0aWFsaXplQXR0ZW50aW9uTGFiZWxJZCgpIHtcbiAgICBpZiAoIXRoaXMuYXR0ZW50aW9uTGFiZWxJZCkge1xuICAgICAgY29uc3QgYXR0ZW50aW9uTGFiZWwgPSBjb3JlLmdldElucHV0KCdhdHRlbnRpb24tbGFiZWwnLCB7IHJlcXVpcmVkOiBmYWxzZSB9KSB8fCAnYXR0ZW50aW9uJztcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZ2l0aHViQ2xpZW50LnF1ZXJ5PEdldExhYmVsSWRRdWVyeT4oe1xuICAgICAgICBxdWVyeTogR2V0TGFiZWxJZCxcbiAgICAgICAgdmFyaWFibGVzOiB7XG4gICAgICAgICAgb3duZXI6IHRoaXMub3duZXIsXG4gICAgICAgICAgbmFtZTogdGhpcy5yZXBvLFxuICAgICAgICAgIGxhYmVsTmFtZTogYXR0ZW50aW9uTGFiZWxcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIGlmICghcmVzdWx0LmRhdGEucmVwb3NpdG9yeT8ubGFiZWw/LmlkKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgQ291bGRuJ3QgZmluZCBtZW50aW9uZWQgTGFiZWwhYCk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuYXR0ZW50aW9uTGFiZWxJZCA9IHJlc3VsdC5kYXRhLnJlcG9zaXRvcnk/LmxhYmVsPy5pZDtcbiAgICAgIHJldHVybiB0aGlzLmF0dGVudGlvbkxhYmVsSWQ7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiB0aGlzLmF0dGVudGlvbkxhYmVsSWQ7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgZ2V0VG90YWxEaXNjdXNzaW9uQ291bnQoY2F0ZWdvcnlJRDogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzdWx0Q291bnRPYmplY3QgPSBhd2FpdCB0aGlzLmdpdGh1YkNsaWVudC5xdWVyeTxHZXREaXNjdXNzaW9uQ291bnRRdWVyeT4oe1xuICAgICAgcXVlcnk6IEdldERpc2N1c3Npb25Db3VudCxcbiAgICAgIHZhcmlhYmxlczoge1xuICAgICAgICBvd25lcjogdGhpcy5vd25lcixcbiAgICAgICAgbmFtZTogdGhpcy5yZXBvLFxuICAgICAgICBjYXRlZ29yeUlkOiBjYXRlZ29yeUlEXG4gICAgICB9LFxuICAgIH0pO1xuICAgIGlmIChyZXN1bHRDb3VudE9iamVjdC5lcnJvcikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRXJyb3IgaW4gcmVhZGluZyBkaXNjdXNzaW9ucyBjb3VudFwiKTtcbiAgICB9XG5cbiAgICBjb3JlLmRlYnVnKGBUb3RhbCBkaXNjdXNzaW9uIGNvdW50IDogJHtyZXN1bHRDb3VudE9iamVjdC5kYXRhLnJlcG9zaXRvcnk/LmRpc2N1c3Npb25zLnRvdGFsQ291bnR9YCk7XG4gICAgcmV0dXJuIHJlc3VsdENvdW50T2JqZWN0LmRhdGEucmVwb3NpdG9yeT8uZGlzY3Vzc2lvbnMudG90YWxDb3VudDtcbiAgfVxuXG4gIGFzeW5jIGdldERpc2N1c3Npb25zTWV0YURhdGEoY2F0ZWdvcnlJRDogc3RyaW5nKTogUHJvbWlzZTxEaXNjdXNzaW9uQ29ubmVjdGlvbj4ge1xuICAgIGNvbnN0IGRpc2N1c3Npb25zQ291bnQgPSBhd2FpdCB0aGlzLmdldFRvdGFsRGlzY3Vzc2lvbkNvdW50KGNhdGVnb3J5SUQpO1xuICAgIGNvbnN0IGRpc2N1c3Npb25JZExpc3Q6IERpc2N1c3Npb25Db25uZWN0aW9uW10gPSBbXTtcblxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZ2l0aHViQ2xpZW50LnF1ZXJ5PEdldERpc2N1c3Npb25EYXRhUXVlcnk+KHtcbiAgICAgIHF1ZXJ5OiBHZXREaXNjdXNzaW9uRGF0YSxcbiAgICAgIHZhcmlhYmxlczoge1xuICAgICAgICBvd25lcjogdGhpcy5vd25lcixcbiAgICAgICAgbmFtZTogdGhpcy5yZXBvLFxuICAgICAgICBjYXRlZ29yeUlEOiBjYXRlZ29yeUlELFxuICAgICAgICBjb3VudDogZGlzY3Vzc2lvbnNDb3VudCxcbiAgICAgIH0sXG4gICAgfSlcblxuICAgIGlmIChyZXN1bHQuZXJyb3IpIHsgdGhyb3cgbmV3IEVycm9yKFwiRXJyb3IgaW4gcmV0cmlldmluZyBhbGwgZGlzY3Vzc2lvbnMgbWV0YWRhdGFcIik7IH1cblxuICAgIHJldHVybiByZXN1bHQuZGF0YS5yZXBvc2l0b3J5Py5kaXNjdXNzaW9ucyBhcyBEaXNjdXNzaW9uQ29ubmVjdGlvbjtcbiAgfVxuXG4gIGFzeW5jIGdldEFuc3dlcmFibGVEaXNjdXNzaW9uQ2F0ZWdvcnlJRHMoKTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBhbnN3ZXJhYmxlQ2F0ZWdvcnlJRHM6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5naXRodWJDbGllbnQucXVlcnk8R2V0QW5zd2VyYWJsZURpc2N1c3Npb25JZFF1ZXJ5Pih7XG4gICAgICBxdWVyeTogR2V0QW5zd2VyYWJsZURpc2N1c3Npb25JZCxcbiAgICAgIHZhcmlhYmxlczoge1xuICAgICAgICBvd25lcjogdGhpcy5vd25lcixcbiAgICAgICAgbmFtZTogdGhpcy5yZXBvXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKCFyZXN1bHQuZGF0YS5yZXBvc2l0b3J5KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYENvdWxkbid0IGZpbmQgcmVwb3NpdG9yeSBpZCFgKTtcbiAgICB9XG5cbiAgICAvL2l0ZXJhdGUgb3ZlciBkaXNjdXNzaW9uIGNhdGVnb3JpZXMgdG8gZ2V0IHRoZSBpZCBmb3IgYW5zd2VyYWJsZSBvbmVcbiAgICByZXN1bHQuZGF0YS5yZXBvc2l0b3J5LmRpc2N1c3Npb25DYXRlZ29yaWVzLmVkZ2VzPy5mb3JFYWNoKGVsZW1lbnQgPT4ge1xuICAgICAgaWYgKGVsZW1lbnQ/Lm5vZGU/LmlzQW5zd2VyYWJsZSA9PSB0cnVlKSB7XG4gICAgICAgIGFuc3dlcmFibGVDYXRlZ29yeUlEcy5wdXNoKGVsZW1lbnQ/Lm5vZGU/LmlkKTtcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgaWYgKGFuc3dlcmFibGVDYXRlZ29yeUlEcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlRoZXJlIGFyZSBubyBBbnN3ZXJhYmxlIGNhdGVnb3J5IGRpc2N1c3Npb25zIGluIHRoaXMgcmVwb3NpdG9yeVwiKTtcbiAgICB9XG5cbiAgICByZXR1cm4gYW5zd2VyYWJsZUNhdGVnb3J5SURzO1xuICB9XG5cbiAgYXN5bmMgY2xvc2VEaXNjdXNzaW9uQXNSZXNvbHZlZChkaXNjdXNzaW9uSWQ6IHN0cmluZykge1xuICAgIGNvcmUuaW5mbyhcIkNsb3NpbmcgZGlzY3Vzc2lvbiBhcyByZXNvbHZlZFwiKTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmdpdGh1YkNsaWVudC5tdXRhdGU8Q2xvc2VEaXNjdXNzaW9uQXNSZXNvbHZlZE11dGF0aW9uPih7XG4gICAgICBtdXRhdGlvbjogQ2xvc2VEaXNjdXNzaW9uQXNSZXNvbHZlZCxcbiAgICAgIHZhcmlhYmxlczoge1xuICAgICAgICBkaXNjdXNzaW9uSWRcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGlmIChyZXN1bHQuZXJyb3JzKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJFcnJvciBpbiByZXRyaWV2aW5nIHJlc3VsdCBkaXNjdXNzaW9uIGlkXCIpO1xuICAgIH1cblxuICAgIHJldHVybiByZXN1bHQuZGF0YT8uY2xvc2VEaXNjdXNzaW9uPy5kaXNjdXNzaW9uPy5pZDtcbiAgfVxuXG4gIGFzeW5jIGNsb3NlRGlzY3Vzc2lvbkFzT3V0ZGF0ZWQoZGlzY3Vzc2lvbklkOiBzdHJpbmcpIHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmdpdGh1YkNsaWVudC5tdXRhdGU8Q2xvc2VEaXNjdXNzaW9uQXNPdXRkYXRlZE11dGF0aW9uPih7XG4gICAgICBtdXRhdGlvbjogQ2xvc2VEaXNjdXNzaW9uQXNPdXRkYXRlZCxcbiAgICAgIHZhcmlhYmxlczoge1xuICAgICAgICBkaXNjdXNzaW9uSWRcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGlmIChyZXN1bHQuZXJyb3JzKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJFcnJvciBpbiBjbG9zaW5nIG91dGRhdGVkIGRpc2N1c3Npb25cIik7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdC5kYXRhPy5jbG9zZURpc2N1c3Npb24/LmRpc2N1c3Npb24/LmlkO1xuICB9XG5cbiAgYXN5bmMgYWRkQ29tbWVudFRvRGlzY3Vzc2lvbihkaXNjdXNzaW9uSWQ6IHN0cmluZywgYm9keTogc3RyaW5nKSB7XG4gICAgaWYgKGRpc2N1c3Npb25JZCA9PT0gXCJcIikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBDb3VsZG4ndCBjcmVhdGUgY29tbWVudCBhcyBkaXNjdXNzaW9uSWQgaXMgbnVsbCFgKTtcbiAgICB9XG5cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmdpdGh1YkNsaWVudC5tdXRhdGU8QWRkRGlzY3Vzc2lvbkNvbW1lbnRNdXRhdGlvbj4oe1xuICAgICAgbXV0YXRpb246IEFkZERpc2N1c3Npb25Db21tZW50LFxuICAgICAgdmFyaWFibGVzOiB7XG4gICAgICAgIGRpc2N1c3Npb25JZCxcbiAgICAgICAgYm9keSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBpZiAocmVzdWx0LmVycm9ycykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiTXV0YXRpb24gYWRkaW5nIGNvbW1lbnQgdG8gZGlzY3Vzc2lvbiBmYWlsZWQgd2l0aCBlcnJvclwiKTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBtYXJrRGlzY3Vzc2lvbkNvbW1lbnRBc0Fuc3dlcihjb21tZW50SWQ6IHN0cmluZykge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZ2l0aHViQ2xpZW50Lm11dGF0ZTxNYXJrRGlzY3Vzc2lvbkNvbW1lbnRBc0Fuc3dlck11dGF0aW9uPih7XG4gICAgICBtdXRhdGlvbjogTWFya0Rpc2N1c3Npb25Db21tZW50QXNBbnN3ZXIsXG4gICAgICB2YXJpYWJsZXM6IHtcbiAgICAgICAgY29tbWVudElkXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBpZiAocmVzdWx0LmVycm9ycykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRXJyb3IgaW4gbXV0YXRpb24gb2YgbWFya2luZyBjb21tZW50IGFzIGFuc3dlciwgY2FuIG5vdCBwcm9jZWVkXCIpO1xuICAgIH1cblxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBhc3luYyBhZGRBdHRlbnRpb25MYWJlbFRvRGlzY3Vzc2lvbihkaXNjdXNzaW9uSWQ6IHN0cmluZykge1xuICAgIGlmIChkaXNjdXNzaW9uSWQgPT09IFwiXCIpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgZGlzY3Vzc2lvbiBpZCwgY2FuIG5vdCBwcm9jZWVkIVwiKTtcbiAgICB9XG5cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmdpdGh1YkNsaWVudC5tdXRhdGU8QWRkTGFiZWxUb0Rpc2N1c3Npb25NdXRhdGlvbj4oe1xuICAgICAgbXV0YXRpb246IEFkZExhYmVsVG9EaXNjdXNzaW9uLFxuICAgICAgdmFyaWFibGVzOiB7XG4gICAgICAgIGxhYmVsYWJsZUlkOiBkaXNjdXNzaW9uSWQsXG4gICAgICAgIGxhYmVsSWRzOiB0aGlzLmF0dGVudGlvbkxhYmVsSWQsXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBpZiAocmVzdWx0LmVycm9ycykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRXJyb3IgaW4gbXV0YXRpb24gb2YgYWRkaW5nIGxhYmVsIHRvIGRpc2N1c3Npb24sIGNhbiBub3QgcHJvY2VlZCFcIik7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGFzeW5jIHVwZGF0ZURpc2N1c3Npb25Db21tZW50KGNvbW1lbnRJZDogc3RyaW5nLCBib2R5OiBzdHJpbmcpIHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmdpdGh1YkNsaWVudC5tdXRhdGU8VXBkYXRlRGlzY3Vzc2lvbkNvbW1lbnRNdXRhdGlvbj4oe1xuICAgICAgbXV0YXRpb246IFVwZGF0ZURpc2N1c3Npb25Db21tZW50LFxuICAgICAgdmFyaWFibGVzOiB7XG4gICAgICAgIGNvbW1lbnRJZCxcbiAgICAgICAgYm9keVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgaWYgKHJlc3VsdC5lcnJvcnMpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkVycm9yIGluIHVwZGF0aW5nIGRpc2N1c3Npb24gY29tbWVudFwiKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgYXN5bmMgZ2V0RGlzY3Vzc2lvbkNvbW1lbnRDb3VudChvd25lcjogc3RyaW5nLCBuYW1lOiBzdHJpbmcsIGRpc2N1c3Npb25OdW06IG51bWJlcik6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5naXRodWJDbGllbnQucXVlcnk8R2V0RGlzY3Vzc2lvbkNvbW1lbnRDb3VudFF1ZXJ5Pih7XG4gICAgICBxdWVyeTogR2V0RGlzY3Vzc2lvbkNvbW1lbnRDb3VudCxcbiAgICAgIHZhcmlhYmxlczoge1xuICAgICAgICBvd25lcjogdGhpcy5vd25lcixcbiAgICAgICAgbmFtZTogdGhpcy5yZXBvLFxuICAgICAgICBudW06IGRpc2N1c3Npb25OdW1cbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBpZiAocmVzdWx0LmVycm9yKVxuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRXJyb3IgaW4gcmV0cmlldmluZyBjb21tZW50IGNvdW50IHJlbGF0ZWQgdG8gZGlzY3Vzc2lvbiFcIik7XG5cbiAgICByZXR1cm4gcmVzdWx0LmRhdGEucmVwb3NpdG9yeT8uZGlzY3Vzc2lvbj8uY29tbWVudHMudG90YWxDb3VudDtcbiAgfVxuXG5cbiAgYXN5bmMgZ2V0Q29tbWVudFJlYWN0aW9uQ291bnQob3duZXI6IHN0cmluZywgbmFtZTogc3RyaW5nLCBkaXNjdXNzaW9uTnVtOiBudW1iZXIsIGNvbW1lbnRDb3VudDogbnVtYmVyKTogUHJvbWlzZTxhbnk+IHtcbiAgICBpZiAoY29tbWVudENvdW50ID09IDApXG4gICAge1xuICAgICAgY29yZS5pbmZvKFwiQ29tbWVudHMgb24gdGhlIGRpc2N1c3Npb24gZG9lcyBub3QgZXhpc3QhXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZ2l0aHViQ2xpZW50LnF1ZXJ5PEdldENvbW1lbnRSZWFjdGlvbkNvdW50UXVlcnk+KHtcbiAgICAgIHF1ZXJ5OiBHZXRDb21tZW50UmVhY3Rpb25Db3VudCxcbiAgICAgIHZhcmlhYmxlczoge1xuICAgICAgICBvd25lcjogdGhpcy5vd25lcixcbiAgICAgICAgbmFtZTogdGhpcy5yZXBvLFxuICAgICAgICBkaXNjdXNzaW9uTnVtOiBkaXNjdXNzaW9uTnVtLFxuICAgICAgICBjb21tZW50Q291bnQ6IGNvbW1lbnRDb3VudFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChyZXN1bHQuZXJyb3IpXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJFcnJvciBpbiByZXRyaWV2aW5nIGNvbW1lbnQgY291bnQgcmVsYXRlZCB0byBkaXNjdXNzaW9uIVwiKTtcblxuICAgIHJldHVybiByZXN1bHQuZGF0YS5yZXBvc2l0b3J5Py5kaXNjdXNzaW9uPy5jb21tZW50cz8uZWRnZXM7XG4gIH1cblxuICBhc3luYyBnZXRDb21tZW50UmVhY3Rpb25EYXRhKG93bmVyOiBzdHJpbmcsIG5hbWU6IHN0cmluZywgZGlzY3Vzc2lvbk51bTogbnVtYmVyLCBjb21tZW50Q291bnQ6IG51bWJlciwgcmVhY3Rpb25Db3VudDogbnVtYmVyKTogUHJvbWlzZTxhbnk+IHtcbiAgICBpZiAocmVhY3Rpb25Db3VudCA9PSAwKVxuICAgIHtcbiAgICAgIGNvcmUuaW5mbyhcIk5vIHJlYWN0aW9ucyBwb3N0ZWQgb24gdGhlIGNvbW1lbnRzIVwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmdpdGh1YkNsaWVudC5xdWVyeTxHZXRDb21tZW50UmVhY3Rpb25EYXRhUXVlcnk+KHtcbiAgICAgIHF1ZXJ5OiBHZXRDb21tZW50UmVhY3Rpb25EYXRhLFxuICAgICAgdmFyaWFibGVzOiB7XG4gICAgICAgIG93bmVyOiB0aGlzLm93bmVyLFxuICAgICAgICBuYW1lOiB0aGlzLnJlcG8sXG4gICAgICAgIGRpc2N1c3Npb25OdW06IGRpc2N1c3Npb25OdW0sXG4gICAgICAgIGNvbW1lbnRDb3VudDogY29tbWVudENvdW50LFxuICAgICAgICByZWFjdGlvbkNvdW50OiByZWFjdGlvbkNvdW50XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKHJlc3VsdC5lcnJvcilcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkVycm9yIGluIHJldHJpZXZpbmcgcmVhY3Rpb24gb24gY29tbWVudCFcIik7XG5cbiAgICByZXR1cm4gcmVzdWx0LmRhdGEucmVwb3NpdG9yeT8uZGlzY3Vzc2lvbj8uY29tbWVudHMuZWRnZXM7XG4gIH1cblxuXG4gIGFzeW5jIGdldENvbW1lbnRzTWV0YURhdGEoZGlzY3Vzc2lvbk51bTogbnVtYmVyLCBjb21tZW50Q291bnQ6IG51bWJlcik6IFByb21pc2U8RGlzY3Vzc2lvbkNvbW1lbnRDb25uZWN0aW9uPiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5naXRodWJDbGllbnQucXVlcnk8R2V0Q29tbWVudE1ldGFEYXRhUXVlcnksIEdldENvbW1lbnRNZXRhRGF0YVF1ZXJ5VmFyaWFibGVzPih7XG4gICAgICBxdWVyeTogR2V0Q29tbWVudE1ldGFEYXRhLFxuICAgICAgdmFyaWFibGVzOiB7XG4gICAgICAgIG93bmVyOiB0aGlzLm93bmVyLFxuICAgICAgICBuYW1lOiB0aGlzLnJlcG8sXG4gICAgICAgIGRpc2N1c3Npb25OdW1iZXI6IGRpc2N1c3Npb25OdW0sXG4gICAgICAgIGNvbW1lbnRDb3VudDogY29tbWVudENvdW50LFxuICAgICAgfSxcbiAgICB9KVxuXG4gICAgaWYgKHJlc3VsdC5lcnJvcikgeyB0aHJvdyBuZXcgRXJyb3IoXCJFcnJvciBpbiByZXRyaWV2aW5nIGNvbW1lbnQgbWV0YWRhdGFcIik7IH1cblxuICAgIHJldHVybiByZXN1bHQuZGF0YS5yZXBvc2l0b3J5Py5kaXNjdXNzaW9uPy5jb21tZW50cyBhcyBEaXNjdXNzaW9uQ29tbWVudENvbm5lY3Rpb24gO1xuICB9XG59XG4iXX0=