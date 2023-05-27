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
        this.initializeGithubClient();
        this.initializeAttentionLabelId();
    }
    initializeGithubClient() {
        this.githubClient = new core_1.ApolloClient({
            link: new core_1.HttpLink({
                uri: "https://api.github.com/graphql",
                headers: {
                    authorization: `token ${this.githubToken}`,
                },
                fetch: cross_fetch_1.default
            }),
            cache: new core_1.InMemoryCache(),
        });
        return this.githubClient;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiR2l0aHViRGlzY3Vzc2lvbkNsaWVudC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9HaXRodWJEaXNjdXNzaW9uQ2xpZW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLDhDQUFtRztBQUNuRyxzQ0FBc0M7QUFDdEMsNkNBQWdDO0FBRWhDLGlEQUFzckI7QUFFdHJCLE1BQWEsc0JBQXNCO0lBT2pDLFlBQVksS0FBYSxFQUFFLElBQVk7UUFDckMsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7UUFDbkIsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7UUFDakIsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxjQUFjLEVBQUUsRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLENBQUMsSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQztRQUNuRyxJQUFJLENBQUMsV0FBVyxFQUFFO1lBQ2hCLE1BQU0sSUFBSSxLQUFLLENBQUMsZ0lBQWdJLENBQUMsQ0FBQztTQUNuSjthQUFNO1lBQ0wsSUFBSSxDQUFDLFdBQVcsR0FBRyxXQUFXLENBQUM7U0FDaEM7UUFFRCxJQUFJLENBQUMsc0JBQXNCLEVBQUUsQ0FBQztRQUM5QixJQUFJLENBQUMsMEJBQTBCLEVBQUUsQ0FBQztJQUNwQyxDQUFDO0lBRU8sc0JBQXNCO1FBQzVCLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxtQkFBWSxDQUFDO1lBQ25DLElBQUksRUFBRSxJQUFJLGVBQVEsQ0FBQztnQkFDakIsR0FBRyxFQUFFLGdDQUFnQztnQkFDckMsT0FBTyxFQUFFO29CQUNQLGFBQWEsRUFBRSxTQUFTLElBQUksQ0FBQyxXQUFXLEVBQUU7aUJBQzNDO2dCQUNELEtBQUssRUFBTCxxQkFBSzthQUNOLENBQUM7WUFDRixLQUFLLEVBQUUsSUFBSSxvQkFBYSxFQUFFO1NBQzNCLENBQUMsQ0FBQztRQUNILE9BQU8sSUFBSSxDQUFDLFlBQVksQ0FB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Q0FBQyw2QkFBNkIsQ0FBQyxZQUFvQjtRQUN0RCxJQUFJLFlBQVksS0FBSyxFQUFFLEVBQUU7WUFDdkIsTUFBTSxJQUFJLEtBQUssQ0FBQyx5Q0FBeUMsQ0FBQyxDQUFDO1NBQzVEO1FBRUQsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBK0I7WUFDMUUsUUFBUSxFQUFFLDhCQUFvQjtZQUM5QixTQUFTLEVBQUU7Z0JBQ1QsV0FBVyxFQUFFLFlBQVk7Z0JBQ3pCLFFBQVEsRUFBRSxJQUFJLENBQUMsZ0JBQWdCO2FBQ2hDO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsSUFBSSxNQUFNLENBQUMsTUFBTSxFQUFFO1lBQ2pCLE1BQU0sSUFBSSxLQUFLLENBQUMsbUVBQW1FLENBQUMsQ0FBQztTQUN0RjtRQUVELE9BQU8sTUFBTSxDQUFDO0lBQ2hCLENBQUM7SUFFRCxLQUFLLENBQUMsdUJBQXVCLENBQUMsU0FBaUIsRUFBRSxJQUFZO1FBQzNELE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQWtDO1lBQzdFLFFBQVEsRUFBRSxpQ0FBdUI7WUFDakMsU0FBUyxFQUFFO2dCQUNULFNBQVM7Z0JBQ1QsSUFBSTthQUNMO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsSUFBSSxNQUFNLENBQUMsTUFBTSxFQUFFO1lBQ2pCLE1BQU0sSUFBSSxLQUFLLENBQUMsc0NBQXNDLENBQUMsQ0FBQztTQUN6RDtRQUVELE9BQU8sTUFBTSxDQUFDO0lBQ2hCLENBQUM7Q0FDRjtBQTlORCx3REE4TkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBcG9sbG9DbGllbnQsIEh0dHBMaW5rLCBJbk1lbW9yeUNhY2hlLCBOb3JtYWxpemVkQ2FjaGVPYmplY3QgfSBmcm9tIFwiQGFwb2xsby9jbGllbnQvY29yZVwiO1xuaW1wb3J0ICogYXMgY29yZSBmcm9tICdAYWN0aW9ucy9jb3JlJztcbmltcG9ydCBmZXRjaCBmcm9tICdjcm9zcy1mZXRjaCc7XG5pbXBvcnQgeyBEaXNjdXNzaW9uQ29ubmVjdGlvbiB9IGZyb20gXCJAb2N0b2tpdC9ncmFwaHFsLXNjaGVtYVwiO1xuaW1wb3J0IHsgR2V0RGlzY3Vzc2lvbkNvdW50UXVlcnksIEdldERpc2N1c3Npb25Db3VudFF1ZXJ5VmFyaWFibGVzLCBHZXREaXNjdXNzaW9uQ291bnQsIEdldERpc2N1c3Npb25EYXRhUXVlcnksIEdldERpc2N1c3Npb25EYXRhUXVlcnlWYXJpYWJsZXMsIEdldERpc2N1c3Npb25EYXRhLCBHZXRBbnN3ZXJhYmxlRGlzY3Vzc2lvbklkUXVlcnksIEdldEFuc3dlcmFibGVEaXNjdXNzaW9uSWRRdWVyeVZhcmlhYmxlcywgR2V0QW5zd2VyYWJsZURpc2N1c3Npb25JZCwgR2V0TGFiZWxJZFF1ZXJ5LCBHZXRMYWJlbElkLCBDbG9zZURpc2N1c3Npb25Bc1Jlc29sdmVkTXV0YXRpb24sIENsb3NlRGlzY3Vzc2lvbkFzUmVzb2x2ZWQsIENsb3NlRGlzY3Vzc2lvbkFzT3V0ZGF0ZWRNdXRhdGlvbiwgQ2xvc2VEaXNjdXNzaW9uQXNPdXRkYXRlZCwgQWRkRGlzY3Vzc2lvbkNvbW1lbnRNdXRhdGlvbiwgQWRkRGlzY3Vzc2lvbkNvbW1lbnQsIE1hcmtEaXNjdXNzaW9uQ29tbWVudEFzQW5zd2VyTXV0YXRpb24sIE1hcmtEaXNjdXNzaW9uQ29tbWVudEFzQW5zd2VyLCBBZGRMYWJlbFRvRGlzY3Vzc2lvbk11dGF0aW9uLCBBZGRMYWJlbFRvRGlzY3Vzc2lvbiwgVXBkYXRlRGlzY3Vzc2lvbkNvbW1lbnRNdXRhdGlvbiwgVXBkYXRlRGlzY3Vzc2lvbkNvbW1lbnQsIFJlYWN0aW9uQ29udGVudCB9IGZyb20gXCIuL2dlbmVyYXRlZC9ncmFwaHFsXCI7XG5cbmV4cG9ydCBjbGFzcyBHaXRodWJEaXNjdXNzaW9uQ2xpZW50IHtcbiAgcHVibGljIGdpdGh1YkNsaWVudDogQXBvbGxvQ2xpZW50PE5vcm1hbGl6ZWRDYWNoZU9iamVjdD47XG4gIHByaXZhdGUgZ2l0aHViVG9rZW46IHN0cmluZztcbiAgcHJpdmF0ZSBvd25lcjogc3RyaW5nO1xuICBwcml2YXRlIHJlcG86IHN0cmluZztcbiAgcHJpdmF0ZSBhdHRlbnRpb25MYWJlbElkOiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3Iob3duZXI6IHN0cmluZywgcmVwbzogc3RyaW5nKSB7XG4gICAgdGhpcy5vd25lciA9IG93bmVyO1xuICAgIHRoaXMucmVwbyA9IHJlcG87XG4gICAgY29uc3QgZ2l0aHViVG9rZW4gPSBjb3JlLmdldElucHV0KCdnaXRodWItdG9rZW4nLCB7IHJlcXVpcmVkOiBmYWxzZSB9KSB8fCBwcm9jZXNzLmVudi5HSVRIVUJfVE9LRU47XG4gICAgaWYgKCFnaXRodWJUb2tlbikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdZb3UgbXVzdCBwcm92aWRlIGEgR2l0SHViIHRva2VuIGFzIGFuIGlucHV0IHRvIHRoaXMgYWN0aW9uLCBvciBhcyBhIGBHSVRIVUJfVE9LRU5gIGVudiB2YXJpYWJsZS4gU2VlIHRoZSBSRUFETUUgZm9yIG1vcmUgaW5mby4nKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5naXRodWJUb2tlbiA9IGdpdGh1YlRva2VuO1xuICAgIH1cblxuICAgIHRoaXMuaW5pdGlhbGl6ZUdpdGh1YkNsaWVudCgpO1xuICAgIHRoaXMuaW5pdGlhbGl6ZUF0dGVudGlvbkxhYmVsSWQoKTtcbiAgfVxuXG4gIHByaXZhdGUgaW5pdGlhbGl6ZUdpdGh1YkNsaWVudCgpOiBBcG9sbG9DbGllbnQ8Tm9ybWFsaXplZENhY2hlT2JqZWN0PiB7XG4gICAgdGhpcy5naXRodWJDbGllbnQgPSBuZXcgQXBvbGxvQ2xpZW50KHtcbiAgICAgIGxpbms6IG5ldyBIdHRwTGluayh7XG4gICAgICAgIHVyaTogXCJodHRwczovL2FwaS5naXRodWIuY29tL2dyYXBocWxcIixcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgIGF1dGhvcml6YXRpb246IGB0b2tlbiAke3RoaXMuZ2l0aHViVG9rZW59YCxcbiAgICAgICAgfSxcbiAgICAgICAgZmV0Y2hcbiAgICAgIH0pLFxuICAgICAgY2FjaGU6IG5ldyBJbk1lbW9yeUNhY2hlKCksXG4gICAgfSk7XG4gICAgcmV0dXJuIHRoaXMuZ2l0aHViQ2xpZW50O1xuICB9XG5cbiAgYXN5bmMgaW5pdGlhbGl6ZUF0dGVudGlvbkxhYmVsSWQoKSB7XG4gICAgaWYgKCF0aGlzLmF0dGVudGlvbkxhYmVsSWQpIHtcbiAgICAgIGNvbnN0IGF0dGVudGlvbkxhYmVsID0gY29yZS5nZXRJbnB1dCgnYXR0ZW50aW9uLWxhYmVsJywgeyByZXF1aXJlZDogZmFsc2UgfSkgfHwgJ2F0dGVudGlvbic7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmdpdGh1YkNsaWVudC5xdWVyeTxHZXRMYWJlbElkUXVlcnk+KHtcbiAgICAgICAgcXVlcnk6IEdldExhYmVsSWQsXG4gICAgICAgIHZhcmlhYmxlczoge1xuICAgICAgICAgIG93bmVyOiB0aGlzLm93bmVyLFxuICAgICAgICAgIG5hbWU6IHRoaXMucmVwbyxcbiAgICAgICAgICBsYWJlbE5hbWU6IGF0dGVudGlvbkxhYmVsXG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIFxuICAgICAgaWYgKCFyZXN1bHQuZGF0YS5yZXBvc2l0b3J5Py5sYWJlbD8uaWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDb3VsZG4ndCBmaW5kIG1lbnRpb25lZCBMYWJlbCFgKTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5hdHRlbnRpb25MYWJlbElkID0gcmVzdWx0LmRhdGEucmVwb3NpdG9yeT8ubGFiZWw/LmlkO1xuICAgICAgcmV0dXJuIHRoaXMuYXR0ZW50aW9uTGFiZWxJZDtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHRoaXMuYXR0ZW50aW9uTGFiZWxJZDtcbiAgICB9XG4gIH1cblxuICBhc3luYyBnZXRUb3RhbERpc2N1c3Npb25Db3VudChjYXRlZ29yeUlEOiBzdHJpbmcpIHtcbiAgICBjb25zdCByZXN1bHRDb3VudE9iamVjdCA9IGF3YWl0IHRoaXMuZ2l0aHViQ2xpZW50LnF1ZXJ5PEdldERpc2N1c3Npb25Db3VudFF1ZXJ5LCBHZXREaXNjdXNzaW9uQ291bnRRdWVyeVZhcmlhYmxlcz4oe1xuICAgICAgcXVlcnk6IEdldERpc2N1c3Npb25Db3VudCxcbiAgICAgIHZhcmlhYmxlczoge1xuICAgICAgICBvd25lcjogdGhpcy5vd25lcixcbiAgICAgICAgbmFtZTogdGhpcy5yZXBvLFxuICAgICAgICBjYXRlZ29yeUlkOiBjYXRlZ29yeUlEXG4gICAgICB9LFxuICAgIH0pO1xuICBcbiAgICBpZiAocmVzdWx0Q291bnRPYmplY3QuZXJyb3IpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkVycm9yIGluIHJlYWRpbmcgZGlzY3Vzc2lvbnMgY291bnRcIik7XG4gICAgfVxuICBcbiAgICBjb3JlLmRlYnVnKGBUb3RhbCBkaXNjdXNzaW9uIGNvdW50IDogJHtyZXN1bHRDb3VudE9iamVjdC5kYXRhLnJlcG9zaXRvcnk/LmRpc2N1c3Npb25zLnRvdGFsQ291bnR9YCk7XG4gICAgcmV0dXJuIHJlc3VsdENvdW50T2JqZWN0LmRhdGEucmVwb3NpdG9yeT8uZGlzY3Vzc2lvbnMudG90YWxDb3VudDtcbiAgfVxuXG4gIGFzeW5jIGdldERpc2N1c3Npb25zTWV0YURhdGEoY2F0ZWdvcnlJRDogc3RyaW5nKTogUHJvbWlzZTxEaXNjdXNzaW9uQ29ubmVjdGlvbj4ge1xuICAgIGNvbnN0IGRpc2N1c3Npb25zQ291bnQgPSBhd2FpdCB0aGlzLmdldFRvdGFsRGlzY3Vzc2lvbkNvdW50KGNhdGVnb3J5SUQpO1xuICBcbiAgICBjb25zdCBkaXNjdXNzaW9ucyA9IGF3YWl0IHRoaXMuZ2l0aHViQ2xpZW50LnF1ZXJ5PEdldERpc2N1c3Npb25EYXRhUXVlcnksIEdldERpc2N1c3Npb25EYXRhUXVlcnlWYXJpYWJsZXM+KHtcbiAgICAgIHF1ZXJ5OiBHZXREaXNjdXNzaW9uRGF0YSxcbiAgICAgIHZhcmlhYmxlczoge1xuICAgICAgICBvd25lcjogdGhpcy5vd25lcixcbiAgICAgICAgbmFtZTogdGhpcy5yZXBvLFxuICAgICAgICBjYXRlZ29yeUlEOiBjYXRlZ29yeUlELFxuICAgICAgICBjb3VudDogZGlzY3Vzc2lvbnNDb3VudCxcbiAgICAgIH0sXG4gICAgfSlcbiAgXG4gICAgaWYgKGRpc2N1c3Npb25zLmVycm9yKSB7IHRocm93IG5ldyBFcnJvcihcIkVycm9yIGluIHJldHJpZXZpbmcgZGlzY3Vzc2lvbnMgbWV0YWRhdGFcIik7IH1cbiAgXG4gICAgLy9pdGVyYXRlIG92ZXIgZWFjaCBkaXNjdXNzaW9uIHRvIHByb2Nlc3MgYm9keSB0ZXh0L2NvbW1lbnRzL3JlYWN0aW9uc1xuICAgIHJldHVybiBkaXNjdXNzaW9ucy5kYXRhLnJlcG9zaXRvcnk/LmRpc2N1c3Npb25zIGFzIERpc2N1c3Npb25Db25uZWN0aW9uO1xuICB9XG5cbiAgYXN5bmMgZ2V0QW5zd2VyYWJsZURpc2N1c3Npb25DYXRlZ29yeUlEcygpOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGFuc3dlcmFibGVDYXRlZ29yeUlEczogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmdpdGh1YkNsaWVudC5xdWVyeTxHZXRBbnN3ZXJhYmxlRGlzY3Vzc2lvbklkUXVlcnksIEdldEFuc3dlcmFibGVEaXNjdXNzaW9uSWRRdWVyeVZhcmlhYmxlcz4oe1xuICAgICAgcXVlcnk6IEdldEFuc3dlcmFibGVEaXNjdXNzaW9uSWQsXG4gICAgICB2YXJpYWJsZXM6IHtcbiAgICAgICAgb3duZXI6IHRoaXMub3duZXIsXG4gICAgICAgIG5hbWU6IHRoaXMucmVwb1xuICAgICAgfSxcbiAgICB9KTtcbiAgXG4gICAgaWYgKCFyZXN1bHQuZGF0YS5yZXBvc2l0b3J5KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYENvdWxkbid0IGZpbmQgcmVwb3NpdG9yeSBpZCFgKTtcbiAgICB9XG4gIFxuICAgIC8vaXRlcmF0ZSBvdmVyIGRpc2N1c3Npb24gY2F0ZWdvcmllcyB0byBnZXQgdGhlIGlkIGZvciBhbnN3ZXJhYmxlIG9uZVxuICAgIHJlc3VsdC5kYXRhLnJlcG9zaXRvcnkuZGlzY3Vzc2lvbkNhdGVnb3JpZXMuZWRnZXM/LmZvckVhY2goZWxlbWVudCA9PiB7XG4gICAgICBpZiAoZWxlbWVudD8ubm9kZT8uaXNBbnN3ZXJhYmxlID09IHRydWUpIHtcbiAgICAgICAgYW5zd2VyYWJsZUNhdGVnb3J5SURzLnB1c2goZWxlbWVudD8ubm9kZT8uaWQpO1xuICAgICAgfVxuICAgIH0pXG4gIFxuICAgIGlmIChhbnN3ZXJhYmxlQ2F0ZWdvcnlJRHMubGVuZ3RoID09PSAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJUaGVyZSBhcmUgbm8gQW5zd2VyYWJsZSBjYXRlZ29yeSBkaXNjdXNzaW9ucyBpbiB0aGlzIHJlcG9zaXRvcnlcIik7XG4gICAgfVxuICBcbiAgICByZXR1cm4gYW5zd2VyYWJsZUNhdGVnb3J5SURzO1xuICB9XG5cbiAgYXN5bmMgY2xvc2VEaXNjdXNzaW9uQXNSZXNvbHZlZChkaXNjdXNzaW9uSWQ6IHN0cmluZykge1xuICAgIGNvcmUuaW5mbyhcIkNsb3NpbmcgZGlzY3Vzc2lvbiBhcyByZXNvbHZlZFwiKTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmdpdGh1YkNsaWVudC5tdXRhdGU8Q2xvc2VEaXNjdXNzaW9uQXNSZXNvbHZlZE11dGF0aW9uPih7XG4gICAgICBtdXRhdGlvbjogQ2xvc2VEaXNjdXNzaW9uQXNSZXNvbHZlZCxcbiAgICAgIHZhcmlhYmxlczoge1xuICAgICAgICBkaXNjdXNzaW9uSWRcbiAgICAgIH1cbiAgICB9KTtcbiAgXG4gICAgaWYgKHJlc3VsdC5lcnJvcnMpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkVycm9yIGluIHJldHJpZXZpbmcgcmVzdWx0IGRpc2N1c3Npb24gaWRcIik7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdC5kYXRhPy5jbG9zZURpc2N1c3Npb24/LmRpc2N1c3Npb24/LmlkO1xuICB9XG5cbiAgYXN5bmMgY2xvc2VEaXNjdXNzaW9uQXNPdXRkYXRlZChkaXNjdXNzaW9uSWQ6IHN0cmluZykge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZ2l0aHViQ2xpZW50Lm11dGF0ZTxDbG9zZURpc2N1c3Npb25Bc091dGRhdGVkTXV0YXRpb24+KHtcbiAgICAgIG11dGF0aW9uOiBDbG9zZURpc2N1c3Npb25Bc091dGRhdGVkLFxuICAgICAgdmFyaWFibGVzOiB7XG4gICAgICAgIGRpc2N1c3Npb25JZFxuICAgICAgfVxuICAgIH0pO1xuICBcbiAgICBpZiAocmVzdWx0LmVycm9ycykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRXJyb3IgaW4gY2xvc2luZyBvdXRkYXRlZCBkaXNjdXNzaW9uXCIpO1xuICAgIH1cblxuICAgIHJldHVybiByZXN1bHQuZGF0YT8uY2xvc2VEaXNjdXNzaW9uPy5kaXNjdXNzaW9uPy5pZDtcbiAgfVxuXG4gIGFzeW5jIGFkZENvbW1lbnRUb0Rpc2N1c3Npb24oZGlzY3Vzc2lvbklkOiBzdHJpbmcsIGJvZHk6IHN0cmluZykge1xuICAgIGlmIChkaXNjdXNzaW9uSWQgPT09IFwiXCIpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgQ291bGRuJ3QgY3JlYXRlIGNvbW1lbnQgYXMgZGlzY3Vzc2lvbklkIGlzIG51bGwhYCk7XG4gICAgfVxuXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5naXRodWJDbGllbnQubXV0YXRlPEFkZERpc2N1c3Npb25Db21tZW50TXV0YXRpb24+KHtcbiAgICAgIG11dGF0aW9uOiBBZGREaXNjdXNzaW9uQ29tbWVudCxcbiAgICAgIHZhcmlhYmxlczoge1xuICAgICAgICBkaXNjdXNzaW9uSWQsXG4gICAgICAgIGJvZHksXG4gICAgICB9LFxuICAgIH0pO1xuICBcbiAgICBpZiAocmVzdWx0LmVycm9ycykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiTXV0YXRpb24gYWRkaW5nIGNvbW1lbnQgdG8gZGlzY3Vzc2lvbiBmYWlsZWQgd2l0aCBlcnJvclwiKTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBtYXJrRGlzY3Vzc2lvbkNvbW1lbnRBc0Fuc3dlcihjb21tZW50SWQ6IHN0cmluZykge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZ2l0aHViQ2xpZW50Lm11dGF0ZTxNYXJrRGlzY3Vzc2lvbkNvbW1lbnRBc0Fuc3dlck11dGF0aW9uPih7XG4gICAgICBtdXRhdGlvbjogTWFya0Rpc2N1c3Npb25Db21tZW50QXNBbnN3ZXIsXG4gICAgICB2YXJpYWJsZXM6IHtcbiAgICAgICAgY29tbWVudElkXG4gICAgICB9XG4gICAgfSk7XG4gIFxuICAgIGlmIChyZXN1bHQuZXJyb3JzKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJFcnJvciBpbiBtdXRhdGlvbiBvZiBtYXJraW5nIGNvbW1lbnQgYXMgYW5zd2VyLCBjYW4gbm90IHByb2NlZWRcIik7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGFzeW5jIGFkZEF0dGVudGlvbkxhYmVsVG9EaXNjdXNzaW9uKGRpc2N1c3Npb25JZDogc3RyaW5nKSB7XG4gICAgaWYgKGRpc2N1c3Npb25JZCA9PT0gXCJcIikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCBkaXNjdXNzaW9uIGlkLCBjYW4gbm90IHByb2NlZWQhXCIpO1xuICAgIH1cbiAgXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5naXRodWJDbGllbnQubXV0YXRlPEFkZExhYmVsVG9EaXNjdXNzaW9uTXV0YXRpb24+KHtcbiAgICAgIG11dGF0aW9uOiBBZGRMYWJlbFRvRGlzY3Vzc2lvbixcbiAgICAgIHZhcmlhYmxlczoge1xuICAgICAgICBsYWJlbGFibGVJZDogZGlzY3Vzc2lvbklkLFxuICAgICAgICBsYWJlbElkczogdGhpcy5hdHRlbnRpb25MYWJlbElkLFxuICAgICAgfVxuICAgIH0pO1xuICBcbiAgICBpZiAocmVzdWx0LmVycm9ycykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRXJyb3IgaW4gbXV0YXRpb24gb2YgYWRkaW5nIGxhYmVsIHRvIGRpc2N1c3Npb24sIGNhbiBub3QgcHJvY2VlZCFcIik7XG4gICAgfVxuICBcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgYXN5bmMgdXBkYXRlRGlzY3Vzc2lvbkNvbW1lbnQoY29tbWVudElkOiBzdHJpbmcsIGJvZHk6IHN0cmluZykge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZ2l0aHViQ2xpZW50Lm11dGF0ZTxVcGRhdGVEaXNjdXNzaW9uQ29tbWVudE11dGF0aW9uPih7XG4gICAgICBtdXRhdGlvbjogVXBkYXRlRGlzY3Vzc2lvbkNvbW1lbnQsXG4gICAgICB2YXJpYWJsZXM6IHtcbiAgICAgICAgY29tbWVudElkLFxuICAgICAgICBib2R5XG4gICAgICB9XG4gICAgfSk7XG4gIFxuICAgIGlmIChyZXN1bHQuZXJyb3JzKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJFcnJvciBpbiB1cGRhdGluZyBkaXNjdXNzaW9uIGNvbW1lbnRcIik7XG4gICAgfVxuICBcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG59XG4iXX0=