"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GithubDiscussionClient = void 0;
const core_1 = require("@apollo/client/core");
const core = require("@actions/core");
const graphql_1 = require("./generated/graphql");
const DAYS_UNTIL_STALE = parseInt(core.getInput('days-until-stale', { required: false })) || 7;
const DAYS_UNTIL_CLOSE = parseInt(core.getInput('days-until-close', { required: false })) || 4;
class GithubDiscussionClient {
    constructor(owner, repo) {
        const githubToken = core.getInput('github-token', { required: false }) || process.env.GITHUB_TOKEN;
        if (!githubToken) {
            throw new Error('You must provide a GitHub token as an input to this action, or as a `GITHUB_TOKEN` env variable. See the README for more info.');
        }
        else {
            this.githubToken = githubToken;
        }
        this.getGithubClient();
    }
    getGithubClient() {
        if (!this.githubClient) {
            this.githubClient = new core_1.ApolloClient({
                link: new core_1.HttpLink({
                    uri: "https://api.github.com/graphql",
                    headers: {
                        authorization: `token ${this.githubToken}`,
                    },
                    fetch
                }),
                cache: new core_1.InMemoryCache(),
            });
            return this.githubClient;
        }
        else {
            return this.githubClient;
        }
    }
    async closeDiscussionsInAbsenceOfReaction(commentDate, discussionId) {
        const currentDate = new Date();
        const diffInMs = currentDate.getTime() - commentDate.getTime();
        const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
        core.debug(`current date: ${currentDate} and the comment date : ${commentDate}`);
        if ((diffInDays >= DAYS_UNTIL_CLOSE)) {
            core.info("Discussion author has not responded in a while, so closing the discussion");
            const closeForStalenessResponseText = "Closing the discussion for staleness";
            core.debug("Responsetext: " + closeForStalenessResponseText);
            this.addCommentToDiscussion(discussionId, closeForStalenessResponseText);
            this.closeDiscussionAsOutdated(discussionId);
        }
    }
    async triggerReactionContentBasedAction(content, bodyText, discussionId, commentId, proposedAnswerText) {
        core.debug("Printing content reaction :  " + content);
        if (content.length === 0) {
            throw new Error("Null content reaction received, can not proceed");
        }
        if ((content === graphql_1.ReactionContent.ThumbsUp) || (content === graphql_1.ReactionContent.Heart) || (content === graphql_1.ReactionContent.Hooray) || (content === graphql_1.ReactionContent.Laugh) || (content === graphql_1.ReactionContent.Rocket)) {
            core.info("Positive reaction received. Marking discussion as answered");
            //remove the keyword from the comment and upate comment
            const updatedText = bodyText.replace(proposedAnswerText, 'Answer: ');
            core.debug("updated text :" + updatedText);
            await this.updateDiscussionComment(commentId, updatedText);
            await this.markDiscussionCommentAsAnswer(commentId);
            await this.closeDiscussionAsResolved(discussionId);
        }
        else if ((content === graphql_1.ReactionContent.ThumbsDown) || (content === graphql_1.ReactionContent.Confused)) {
            core.info("Negative reaction received. Adding attention label to receive further attention from a repository maintainer");
            await this.addAttentionLabelToDiscussion(discussionId);
        }
    }
    async remindAuthorForAction(commentDate, author, discussionId, remindResponseText) {
        const currentDate = new Date();
        const diffInMs = currentDate.getTime() - commentDate.getTime();
        const diffInHrs = Math.floor(diffInMs / (1000 * 60 * 60));
        const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
        core.debug(`current date: ${currentDate} and the comment date : ${commentDate}`);
        core.debug(`Answer was proposed ${diffInDays} days and ${diffInHrs} hrs ago.`);
        if ((diffInDays >= DAYS_UNTIL_STALE)) {
            const remindAuthorResponseText = "Hey @" + author + ", " + remindResponseText;
            core.debug("Responsetext: " + remindAuthorResponseText);
            await this.addCommentToDiscussion(discussionId, remindAuthorResponseText);
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
    async getAttentionLabelId(label) {
        if (!this.attentionLabelId) {
            const attentionLabel = core.getInput('attention-label', { required: false }) || 'attention';
            const result = await this.githubClient.query({
                query: graphql_1.GetLabelId,
                variables: {
                    owner: this.owner,
                    name: this.repo,
                    labelName: label
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
        core.debug("discussionID :: " + discussionId + " bodyText ::" + body);
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
        core.debug("discussion id : " + discussionId + "  labelid : " + this.attentionLabelId);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiR2l0aHViRGlzY3Vzc2lvbkNsaWVudC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9HaXRodWJEaXNjdXNzaW9uQ2xpZW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLDhDQUFtRztBQUNuRyxzQ0FBc0M7QUFFdEMsaURBQXNyQjtBQUV0ckIsTUFBTSxnQkFBZ0IsR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsRUFBRSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQy9GLE1BQU0sZ0JBQWdCLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsa0JBQWtCLEVBQUUsRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUUvRixNQUFhLHNCQUFzQjtJQU9qQyxZQUFZLEtBQWEsRUFBRSxJQUFZO1FBQ3JDLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsY0FBYyxFQUFFLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxDQUFDLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUM7UUFDbkcsSUFBSSxDQUFDLFdBQVcsRUFBRTtZQUNoQixNQUFNLElBQUksS0FBSyxDQUFDLGdJQUFnSSxDQUFDLENBQUM7U0FDbko7YUFBTTtZQUNMLElBQUksQ0FBQyxXQUFXLEdBQUcsV0FBVyxDQUFDO1NBQ2hDO1FBRUQsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO0lBQ3pCLENBQUM7SUFFRCxlQUFlO1FBQ2IsSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUU7WUFDdEIsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLG1CQUFZLENBQUM7Z0JBQ25DLElBQUksRUFBRSxJQUFJLGVBQVEsQ0FBQztvQkFDakIsR0FBRyxFQUFFLGdDQUFnQztvQkFDckMsT0FBTyxFQUFFO3dCQUNQLGFBQWEs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NUQ7UUFFRCxJQUFJLENBQUMsS0FBSyxDQUFDLGtCQUFrQixHQUFHLFlBQVksR0FBRyxjQUFjLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFFdkYsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBK0I7WUFDMUUsUUFBUSxFQUFFLDhCQUFvQjtZQUM5QixTQUFTLEVBQUU7Z0JBQ1QsV0FBVyxFQUFFLFlBQVk7Z0JBQ3pCLFFBQVEsRUFBRSxJQUFJLENBQUMsZ0JBQWdCO2FBQ2hDO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsSUFBSSxNQUFNLENBQUMsTUFBTSxFQUFFO1lBQ2pCLE1BQU0sSUFBSSxLQUFLLENBQUMsbUVBQW1FLENBQUMsQ0FBQztTQUN0RjtRQUVELE9BQU8sTUFBTSxDQUFDO0lBQ2hCLENBQUM7SUFFRCxLQUFLLENBQUMsdUJBQXVCLENBQUMsU0FBaUIsRUFBRSxJQUFZO1FBQzNELE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQWtDO1lBQzdFLFFBQVEsRUFBRSxpQ0FBdUI7WUFDakMsU0FBUyxFQUFFO2dCQUNULFNBQVM7Z0JBQ1QsSUFBSTthQUNMO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsSUFBSSxNQUFNLENBQUMsTUFBTSxFQUFFO1lBQ2pCLE1BQU0sSUFBSSxLQUFLLENBQUMsc0NBQXNDLENBQUMsQ0FBQztTQUN6RDtRQUVELE9BQU8sTUFBTSxDQUFDO0lBQ2hCLENBQUM7Q0FDRjtBQXZSRCx3REF1UkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBcG9sbG9DbGllbnQsIEh0dHBMaW5rLCBJbk1lbW9yeUNhY2hlLCBOb3JtYWxpemVkQ2FjaGVPYmplY3QgfSBmcm9tIFwiQGFwb2xsby9jbGllbnQvY29yZVwiO1xuaW1wb3J0ICogYXMgY29yZSBmcm9tICdAYWN0aW9ucy9jb3JlJztcbmltcG9ydCB7IERpc2N1c3Npb25Db25uZWN0aW9uIH0gZnJvbSBcIkBvY3Rva2l0L2dyYXBocWwtc2NoZW1hXCI7XG5pbXBvcnQgeyBHZXREaXNjdXNzaW9uQ291bnRRdWVyeSwgR2V0RGlzY3Vzc2lvbkNvdW50UXVlcnlWYXJpYWJsZXMsIEdldERpc2N1c3Npb25Db3VudCwgR2V0RGlzY3Vzc2lvbkRhdGFRdWVyeSwgR2V0RGlzY3Vzc2lvbkRhdGFRdWVyeVZhcmlhYmxlcywgR2V0RGlzY3Vzc2lvbkRhdGEsIEdldEFuc3dlcmFibGVEaXNjdXNzaW9uSWRRdWVyeSwgR2V0QW5zd2VyYWJsZURpc2N1c3Npb25JZFF1ZXJ5VmFyaWFibGVzLCBHZXRBbnN3ZXJhYmxlRGlzY3Vzc2lvbklkLCBHZXRMYWJlbElkUXVlcnksIEdldExhYmVsSWQsIENsb3NlRGlzY3Vzc2lvbkFzUmVzb2x2ZWRNdXRhdGlvbiwgQ2xvc2VEaXNjdXNzaW9uQXNSZXNvbHZlZCwgQ2xvc2VEaXNjdXNzaW9uQXNPdXRkYXRlZE11dGF0aW9uLCBDbG9zZURpc2N1c3Npb25Bc091dGRhdGVkLCBBZGREaXNjdXNzaW9uQ29tbWVudE11dGF0aW9uLCBBZGREaXNjdXNzaW9uQ29tbWVudCwgTWFya0Rpc2N1c3Npb25Db21tZW50QXNBbnN3ZXJNdXRhdGlvbiwgTWFya0Rpc2N1c3Npb25Db21tZW50QXNBbnN3ZXIsIEFkZExhYmVsVG9EaXNjdXNzaW9uTXV0YXRpb24sIEFkZExhYmVsVG9EaXNjdXNzaW9uLCBVcGRhdGVEaXNjdXNzaW9uQ29tbWVudE11dGF0aW9uLCBVcGRhdGVEaXNjdXNzaW9uQ29tbWVudCwgUmVhY3Rpb25Db250ZW50IH0gZnJvbSBcIi4vZ2VuZXJhdGVkL2dyYXBocWxcIjtcblxuY29uc3QgREFZU19VTlRJTF9TVEFMRSA9IHBhcnNlSW50KGNvcmUuZ2V0SW5wdXQoJ2RheXMtdW50aWwtc3RhbGUnLCB7IHJlcXVpcmVkOiBmYWxzZSB9KSkgfHwgNztcbmNvbnN0IERBWVNfVU5USUxfQ0xPU0UgPSBwYXJzZUludChjb3JlLmdldElucHV0KCdkYXlzLXVudGlsLWNsb3NlJywgeyByZXF1aXJlZDogZmFsc2UgfSkpIHx8IDQ7XG5cbmV4cG9ydCBjbGFzcyBHaXRodWJEaXNjdXNzaW9uQ2xpZW50IHtcbiAgcHVibGljIGdpdGh1YkNsaWVudDogQXBvbGxvQ2xpZW50PE5vcm1hbGl6ZWRDYWNoZU9iamVjdD47XG4gIHByaXZhdGUgZ2l0aHViVG9rZW46IHN0cmluZztcbiAgcHJpdmF0ZSBvd25lcjogc3RyaW5nO1xuICBwcml2YXRlIHJlcG86IHN0cmluZztcbiAgcHJpdmF0ZSBhdHRlbnRpb25MYWJlbElkOiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3Iob3duZXI6IHN0cmluZywgcmVwbzogc3RyaW5nKSB7XG4gICAgY29uc3QgZ2l0aHViVG9rZW4gPSBjb3JlLmdldElucHV0KCdnaXRodWItdG9rZW4nLCB7IHJlcXVpcmVkOiBmYWxzZSB9KSB8fCBwcm9jZXNzLmVudi5HSVRIVUJfVE9LRU47XG4gICAgaWYgKCFnaXRodWJUb2tlbikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdZb3UgbXVzdCBwcm92aWRlIGEgR2l0SHViIHRva2VuIGFzIGFuIGlucHV0IHRvIHRoaXMgYWN0aW9uLCBvciBhcyBhIGBHSVRIVUJfVE9LRU5gIGVudiB2YXJpYWJsZS4gU2VlIHRoZSBSRUFETUUgZm9yIG1vcmUgaW5mby4nKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5naXRodWJUb2tlbiA9IGdpdGh1YlRva2VuO1xuICAgIH1cblxuICAgIHRoaXMuZ2V0R2l0aHViQ2xpZW50KCk7XG4gIH1cblxuICBnZXRHaXRodWJDbGllbnQoKTogQXBvbGxvQ2xpZW50PE5vcm1hbGl6ZWRDYWNoZU9iamVjdD4ge1xuICAgIGlmICghdGhpcy5naXRodWJDbGllbnQpIHtcbiAgICAgIHRoaXMuZ2l0aHViQ2xpZW50ID0gbmV3IEFwb2xsb0NsaWVudCh7XG4gICAgICAgIGxpbms6IG5ldyBIdHRwTGluayh7XG4gICAgICAgICAgdXJpOiBcImh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vZ3JhcGhxbFwiLFxuICAgICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAgIGF1dGhvcml6YXRpb246IGB0b2tlbiAke3RoaXMuZ2l0aHViVG9rZW59YCxcbiAgICAgICAgICB9LFxuICAgICAgICAgIGZldGNoXG4gICAgICAgIH0pLFxuICAgICAgICBjYWNoZTogbmV3IEluTWVtb3J5Q2FjaGUoKSxcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIHRoaXMuZ2l0aHViQ2xpZW50O1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gdGhpcy5naXRodWJDbGllbnQ7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgY2xvc2VEaXNjdXNzaW9uc0luQWJzZW5jZU9mUmVhY3Rpb24oY29tbWVudERhdGU6IERhdGUsIGRpc2N1c3Npb25JZDogc3RyaW5nKSB7XG4gICAgY29uc3QgY3VycmVudERhdGU6IERhdGUgPSBuZXcgRGF0ZSgpO1xuICAgIGNvbnN0IGRpZmZJbk1zOiBudW1iZXIgPSBjdXJyZW50RGF0ZS5nZXRUaW1lKCkgLSBjb21tZW50RGF0ZS5nZXRUaW1lKCk7XG4gICAgY29uc3QgZGlmZkluRGF5czogbnVtYmVyID0gTWF0aC5mbG9vcihkaWZmSW5NcyAvICgxMDAwICogNjAgKiA2MCAqIDI0KSk7XG4gIFxuICAgIGNvcmUuZGVidWcoYGN1cnJlbnQgZGF0ZTogJHtjdXJyZW50RGF0ZX0gYW5kIHRoZSBjb21tZW50IGRhdGUgOiAke2NvbW1lbnREYXRlfWApO1xuICAgIGlmICgoZGlmZkluRGF5cyA+PSBEQVlTX1VOVElMX0NMT1NFKSkge1xuICAgICAgY29yZS5pbmZvKFwiRGlzY3Vzc2lvbiBhdXRob3IgaGFzIG5vdCByZXNwb25kZWQgaW4gYSB3aGlsZSwgc28gY2xvc2luZyB0aGUgZGlzY3Vzc2lvblwiKTtcbiAgICAgIGNvbnN0IGNsb3NlRm9yU3RhbGVuZXNzUmVzcG9uc2VUZXh0ID0gXCJDbG9zaW5nIHRoZSBkaXNjdXNzaW9uIGZvciBzdGFsZW5lc3NcIjtcbiAgICAgIGNvcmUuZGVidWcoXCJSZXNwb25zZXRleHQ6IFwiICsgY2xvc2VGb3JTdGFsZW5lc3NSZXNwb25zZVRleHQpO1xuICAgICAgdGhpcy5hZGRDb21tZW50VG9EaXNjdXNzaW9uKGRpc2N1c3Npb25JZCwgY2xvc2VGb3JTdGFsZW5lc3NSZXNwb25zZVRleHQpO1xuICAgICAgdGhpcy5jbG9zZURpc2N1c3Npb25Bc091dGRhdGVkKGRpc2N1c3Npb25JZCk7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgdHJpZ2dlclJlYWN0aW9uQ29udGVudEJhc2VkQWN0aW9uKGNvbnRlbnQ6IFJlYWN0aW9uQ29udGVudCwgYm9keVRleHQ6IHN0cmluZywgZGlzY3Vzc2lvbklkOiBzdHJpbmcsIGNvbW1lbnRJZDogc3RyaW5nLCBwcm9wb3NlZEFuc3dlclRleHQ6IHN0cmluZykge1xuICAgIGNvcmUuZGVidWcoXCJQcmludGluZyBjb250ZW50IHJlYWN0aW9uIDogIFwiICsgY29udGVudCk7XG4gIFxuICAgIGlmIChjb250ZW50Lmxlbmd0aCA9PT0gMCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiTnVsbCBjb250ZW50IHJlYWN0aW9uIHJlY2VpdmVkLCBjYW4gbm90IHByb2NlZWRcIik7XG4gICAgfVxuICBcbiAgICBpZiAoKGNvbnRlbnQgPT09IFJlYWN0aW9uQ29udGVudC5UaHVtYnNVcCkgfHwgKGNvbnRlbnQgPT09IFJlYWN0aW9uQ29udGVudC5IZWFydCkgfHwgKGNvbnRlbnQgPT09IFJlYWN0aW9uQ29udGVudC5Ib29yYXkpIHx8IChjb250ZW50ID09PSBSZWFjdGlvbkNvbnRlbnQuTGF1Z2gpIHx8IChjb250ZW50ID09PSBSZWFjdGlvbkNvbnRlbnQuUm9ja2V0KSkge1xuICAgICAgY29yZS5pbmZvKFwiUG9zaXRpdmUgcmVhY3Rpb24gcmVjZWl2ZWQuIE1hcmtpbmcgZGlzY3Vzc2lvbiBhcyBhbnN3ZXJlZFwiKTtcbiAgXG4gICAgICAvL3JlbW92ZSB0aGUga2V5d29yZCBmcm9tIHRoZSBjb21tZW50IGFuZCB1cGF0ZSBjb21tZW50XG4gICAgICBjb25zdCB1cGRhdGVkVGV4dCA9IGJvZHlUZXh0LnJlcGxhY2UocHJvcG9zZWRBbnN3ZXJUZXh0LCAnQW5zd2VyOiAnKTtcbiAgICAgIGNvcmUuZGVidWcoXCJ1cGRhdGVkIHRleHQgOlwiICsgdXBkYXRlZFRleHQpO1xuICAgICAgYXdhaXQgdGhpcy51cGRhdGVEaXNjdXNzaW9uQ29tbWVudChjb21tZW50SWQsIHVwZGF0ZWRUZXh0ISk7XG4gICAgICBhd2FpdCB0aGlzLm1hcmtEaXNjdXNzaW9uQ29tbWVudEFzQW5zd2VyKGNvbW1lbnRJZCk7XG4gICAgICBhd2FpdCB0aGlzLmNsb3NlRGlzY3Vzc2lvbkFzUmVzb2x2ZWQoZGlzY3Vzc2lvbklkKTtcbiAgICB9XG4gICAgZWxzZSBpZiAoKGNvbnRlbnQgPT09IFJlYWN0aW9uQ29udGVudC5UaHVtYnNEb3duKSB8fCAoY29udGVudCA9PT0gUmVhY3Rpb25Db250ZW50LkNvbmZ1c2VkKSkge1xuICAgICAgY29yZS5pbmZvKFwiTmVnYXRpdmUgcmVhY3Rpb24gcmVjZWl2ZWQuIEFkZGluZyBhdHRlbnRpb24gbGFiZWwgdG8gcmVjZWl2ZSBmdXJ0aGVyIGF0dGVudGlvbiBmcm9tIGEgcmVwb3NpdG9yeSBtYWludGFpbmVyXCIpO1xuICAgICAgYXdhaXQgdGhpcy5hZGRBdHRlbnRpb25MYWJlbFRvRGlzY3Vzc2lvbihkaXNjdXNzaW9uSWQpO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIHJlbWluZEF1dGhvckZvckFjdGlvbihjb21tZW50RGF0ZTogRGF0ZSwgYXV0aG9yOiBzdHJpbmcsIGRpc2N1c3Npb25JZDogc3RyaW5nLCByZW1pbmRSZXNwb25zZVRleHQ6IHN0cmluZykge1xuICAgIGNvbnN0IGN1cnJlbnREYXRlOiBEYXRlID0gbmV3IERhdGUoKTtcbiAgICBjb25zdCBkaWZmSW5NczogbnVtYmVyID0gY3VycmVudERhdGUuZ2V0VGltZSgpIC0gY29tbWVudERhdGUuZ2V0VGltZSgpO1xuICAgIGNvbnN0IGRpZmZJbkhyczogbnVtYmVyID0gTWF0aC5mbG9vcihkaWZmSW5NcyAvICgxMDAwICogNjAgKiA2MCkpO1xuICAgIGNvbnN0IGRpZmZJbkRheXM6IG51bWJlciA9IE1hdGguZmxvb3IoZGlmZkluTXMgLyAoMTAwMCAqIDYwICogNjAgKiAyNCkpO1xuICBcbiAgICBjb3JlLmRlYnVnKGBjdXJyZW50IGRhdGU6ICR7Y3VycmVudERhdGV9IGFuZCB0aGUgY29tbWVudCBkYXRlIDogJHtjb21tZW50RGF0ZX1gKTtcbiAgICBjb3JlLmRlYnVnKGBBbnN3ZXIgd2FzIHByb3Bvc2VkICR7ZGlmZkluRGF5c30gZGF5cyBhbmQgJHtkaWZmSW5IcnN9IGhycyBhZ28uYCk7XG4gIFxuICAgIGlmICgoZGlmZkluRGF5cyA+PSBEQVlTX1VOVElMX1NUQUxFKSkge1xuICAgICAgY29uc3QgcmVtaW5kQXV0aG9yUmVzcG9uc2VUZXh0ID0gXCJIZXkgQFwiICsgYXV0aG9yICsgXCIsIFwiICsgcmVtaW5kUmVzcG9uc2VUZXh0O1xuICAgICAgY29yZS5kZWJ1ZyhcIlJlc3BvbnNldGV4dDogXCIgKyByZW1pbmRBdXRob3JSZXNwb25zZVRleHQpO1xuICAgICAgYXdhaXQgdGhpcy5hZGRDb21tZW50VG9EaXNjdXNzaW9uKGRpc2N1c3Npb25JZCwgcmVtaW5kQXV0aG9yUmVzcG9uc2VUZXh0KTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBnZXRUb3RhbERpc2N1c3Npb25Db3VudChjYXRlZ29yeUlEOiBzdHJpbmcpIHtcbiAgICBjb25zdCByZXN1bHRDb3VudE9iamVjdCA9IGF3YWl0IHRoaXMuZ2l0aHViQ2xpZW50LnF1ZXJ5PEdldERpc2N1c3Npb25Db3VudFF1ZXJ5LCBHZXREaXNjdXNzaW9uQ291bnRRdWVyeVZhcmlhYmxlcz4oe1xuICAgICAgcXVlcnk6IEdldERpc2N1c3Npb25Db3VudCxcbiAgICAgIHZhcmlhYmxlczoge1xuICAgICAgICBvd25lcjogdGhpcy5vd25lcixcbiAgICAgICAgbmFtZTogdGhpcy5yZXBvLFxuICAgICAgICBjYXRlZ29yeUlkOiBjYXRlZ29yeUlEXG4gICAgICB9LFxuICAgIH0pO1xuICBcbiAgICBpZiAocmVzdWx0Q291bnRPYmplY3QuZXJyb3IpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkVycm9yIGluIHJlYWRpbmcgZGlzY3Vzc2lvbnMgY291bnRcIik7XG4gICAgfVxuICBcbiAgICBjb3JlLmRlYnVnKGBUb3RhbCBkaXNjdXNzaW9uIGNvdW50IDogJHtyZXN1bHRDb3VudE9iamVjdC5kYXRhLnJlcG9zaXRvcnk/LmRpc2N1c3Npb25zLnRvdGFsQ291bnR9YCk7XG4gICAgcmV0dXJuIHJlc3VsdENvdW50T2JqZWN0LmRhdGEucmVwb3NpdG9yeT8uZGlzY3Vzc2lvbnMudG90YWxDb3VudDtcbiAgfVxuXG4gIGFzeW5jIGdldERpc2N1c3Npb25zTWV0YURhdGEoY2F0ZWdvcnlJRDogc3RyaW5nKTogUHJvbWlzZTxEaXNjdXNzaW9uQ29ubmVjdGlvbj4ge1xuICAgIGNvbnN0IGRpc2N1c3Npb25zQ291bnQgPSBhd2FpdCB0aGlzLmdldFRvdGFsRGlzY3Vzc2lvbkNvdW50KGNhdGVnb3J5SUQpO1xuICBcbiAgICBjb25zdCBkaXNjdXNzaW9ucyA9IGF3YWl0IHRoaXMuZ2l0aHViQ2xpZW50LnF1ZXJ5PEdldERpc2N1c3Npb25EYXRhUXVlcnksIEdldERpc2N1c3Npb25EYXRhUXVlcnlWYXJpYWJsZXM+KHtcbiAgICAgIHF1ZXJ5OiBHZXREaXNjdXNzaW9uRGF0YSxcbiAgICAgIHZhcmlhYmxlczoge1xuICAgICAgICBvd25lcjogdGhpcy5vd25lcixcbiAgICAgICAgbmFtZTogdGhpcy5yZXBvLFxuICAgICAgICBjYXRlZ29yeUlEOiBjYXRlZ29yeUlELFxuICAgICAgICBjb3VudDogZGlzY3Vzc2lvbnNDb3VudCxcbiAgICAgIH0sXG4gICAgfSlcbiAgXG4gICAgaWYgKGRpc2N1c3Npb25zLmVycm9yKSB7IHRocm93IG5ldyBFcnJvcihcIkVycm9yIGluIHJldHJpZXZpbmcgZGlzY3Vzc2lvbnMgbWV0YWRhdGFcIik7IH1cbiAgXG4gICAgLy9pdGVyYXRlIG92ZXIgZWFjaCBkaXNjdXNzaW9uIHRvIHByb2Nlc3MgYm9keSB0ZXh0L2NvbW1lbnRzL3JlYWN0aW9uc1xuICAgIHJldHVybiBkaXNjdXNzaW9ucy5kYXRhLnJlcG9zaXRvcnk/LmRpc2N1c3Npb25zIGFzIERpc2N1c3Npb25Db25uZWN0aW9uO1xuICB9XG5cbiAgYXN5bmMgZ2V0QW5zd2VyYWJsZURpc2N1c3Npb25DYXRlZ29yeUlEcygpOiBQcm9taXNlPGFueT4ge1xuXG4gICAgY29uc3QgYW5zd2VyYWJsZUNhdGVnb3J5SURzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZ2l0aHViQ2xpZW50LnF1ZXJ5PEdldEFuc3dlcmFibGVEaXNjdXNzaW9uSWRRdWVyeSwgR2V0QW5zd2VyYWJsZURpc2N1c3Npb25JZFF1ZXJ5VmFyaWFibGVzPih7XG4gICAgICBxdWVyeTogR2V0QW5zd2VyYWJsZURpc2N1c3Npb25JZCxcbiAgICAgIHZhcmlhYmxlczoge1xuICAgICAgICBvd25lcjogdGhpcy5vd25lcixcbiAgICAgICAgbmFtZTogdGhpcy5yZXBvXG4gICAgICB9LFxuICAgIH0pO1xuICBcbiAgICBpZiAoIXJlc3VsdC5kYXRhLnJlcG9zaXRvcnkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgQ291bGRuJ3QgZmluZCByZXBvc2l0b3J5IGlkIWApO1xuICAgIH1cbiAgXG4gICAgLy9pdGVyYXRlIG92ZXIgZGlzY3Vzc2lvbiBjYXRlZ29yaWVzIHRvIGdldCB0aGUgaWQgZm9yIGFuc3dlcmFibGUgb25lXG4gICAgcmVzdWx0LmRhdGEucmVwb3NpdG9yeS5kaXNjdXNzaW9uQ2F0ZWdvcmllcy5lZGdlcz8uZm9yRWFjaChlbGVtZW50ID0+IHtcbiAgICAgIGlmIChlbGVtZW50Py5ub2RlPy5pc0Fuc3dlcmFibGUgPT0gdHJ1ZSkge1xuICAgICAgICBhbnN3ZXJhYmxlQ2F0ZWdvcnlJRHMucHVzaChlbGVtZW50Py5ub2RlPy5pZCk7XG4gICAgICB9XG4gICAgfSlcbiAgXG4gICAgaWYgKGFuc3dlcmFibGVDYXRlZ29yeUlEcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlRoZXJlIGFyZSBubyBBbnN3ZXJhYmxlIGNhdGVnb3J5IGRpc2N1c3Npb25zIGluIHRoaXMgcmVwb3NpdG9yeVwiKTtcbiAgICB9XG4gIFxuICAgIHJldHVybiBhbnN3ZXJhYmxlQ2F0ZWdvcnlJRHM7XG4gIH1cblxuICBhc3luYyBnZXRBdHRlbnRpb25MYWJlbElkKGxhYmVsOiBzdHJpbmcpIHtcbiAgICBpZiAoIXRoaXMuYXR0ZW50aW9uTGFiZWxJZCkge1xuICAgICAgY29uc3QgYXR0ZW50aW9uTGFiZWwgPSBjb3JlLmdldElucHV0KCdhdHRlbnRpb24tbGFiZWwnLCB7IHJlcXVpcmVkOiBmYWxzZSB9KSB8fCAnYXR0ZW50aW9uJztcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZ2l0aHViQ2xpZW50LnF1ZXJ5PEdldExhYmVsSWRRdWVyeT4oe1xuICAgICAgICBxdWVyeTogR2V0TGFiZWxJZCxcbiAgICAgICAgdmFyaWFibGVzOiB7XG4gICAgICAgICAgb3duZXI6IHRoaXMub3duZXIsXG4gICAgICAgICAgbmFtZTogdGhpcy5yZXBvLFxuICAgICAgICAgIGxhYmVsTmFtZTogbGFiZWxcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgXG4gICAgICBpZiAoIXJlc3VsdC5kYXRhLnJlcG9zaXRvcnk/LmxhYmVsPy5pZCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYENvdWxkbid0IGZpbmQgbWVudGlvbmVkIExhYmVsIWApO1xuICAgICAgfVxuXG4gICAgICB0aGlzLmF0dGVudGlvbkxhYmVsSWQgPSByZXN1bHQuZGF0YS5yZXBvc2l0b3J5Py5sYWJlbD8uaWQ7XG4gICAgICByZXR1cm4gdGhpcy5hdHRlbnRpb25MYWJlbElkO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gdGhpcy5hdHRlbnRpb25MYWJlbElkO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGNsb3NlRGlzY3Vzc2lvbkFzUmVzb2x2ZWQoZGlzY3Vzc2lvbklkOiBzdHJpbmcpIHtcbiAgICBjb3JlLmluZm8oXCJDbG9zaW5nIGRpc2N1c3Npb24gYXMgcmVzb2x2ZWRcIik7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5naXRodWJDbGllbnQubXV0YXRlPENsb3NlRGlzY3Vzc2lvbkFzUmVzb2x2ZWRNdXRhdGlvbj4oe1xuICAgICAgbXV0YXRpb246IENsb3NlRGlzY3Vzc2lvbkFzUmVzb2x2ZWQsXG4gICAgICB2YXJpYWJsZXM6IHtcbiAgICAgICAgZGlzY3Vzc2lvbklkXG4gICAgICB9XG4gICAgfSk7XG4gIFxuICAgIGlmIChyZXN1bHQuZXJyb3JzKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJFcnJvciBpbiByZXRyaWV2aW5nIHJlc3VsdCBkaXNjdXNzaW9uIGlkXCIpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0LmRhdGE/LmNsb3NlRGlzY3Vzc2lvbj8uZGlzY3Vzc2lvbj8uaWQ7XG4gIH1cblxuICBhc3luYyBjbG9zZURpc2N1c3Npb25Bc091dGRhdGVkKGRpc2N1c3Npb25JZDogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5naXRodWJDbGllbnQubXV0YXRlPENsb3NlRGlzY3Vzc2lvbkFzT3V0ZGF0ZWRNdXRhdGlvbj4oe1xuICAgICAgbXV0YXRpb246IENsb3NlRGlzY3Vzc2lvbkFzT3V0ZGF0ZWQsXG4gICAgICB2YXJpYWJsZXM6IHtcbiAgICAgICAgZGlzY3Vzc2lvbklkXG4gICAgICB9XG4gICAgfSk7XG4gIFxuICAgIGlmIChyZXN1bHQuZXJyb3JzKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJFcnJvciBpbiBjbG9zaW5nIG91dGRhdGVkIGRpc2N1c3Npb25cIik7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQuZGF0YT8uY2xvc2VEaXNjdXNzaW9uPy5kaXNjdXNzaW9uPy5pZDtcbiAgfVxuXG4gIGFzeW5jIGFkZENvbW1lbnRUb0Rpc2N1c3Npb24oZGlzY3Vzc2lvbklkOiBzdHJpbmcsIGJvZHk6IHN0cmluZykge1xuICAgIGlmIChkaXNjdXNzaW9uSWQgPT09IFwiXCIpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgQ291bGRuJ3QgY3JlYXRlIGNvbW1lbnQgYXMgZGlzY3Vzc2lvbklkIGlzIG51bGwhYCk7XG4gICAgfVxuICBcbiAgICBjb3JlLmRlYnVnKFwiZGlzY3Vzc2lvbklEIDo6IFwiICsgZGlzY3Vzc2lvbklkICsgXCIgYm9keVRleHQgOjpcIiArIGJvZHkpO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZ2l0aHViQ2xpZW50Lm11dGF0ZTxBZGREaXNjdXNzaW9uQ29tbWVudE11dGF0aW9uPih7XG4gICAgICBtdXRhdGlvbjogQWRkRGlzY3Vzc2lvbkNvbW1lbnQsXG4gICAgICB2YXJpYWJsZXM6IHtcbiAgICAgICAgZGlzY3Vzc2lvbklkLFxuICAgICAgICBib2R5LFxuICAgICAgfSxcbiAgICB9KTtcbiAgXG4gICAgaWYgKHJlc3VsdC5lcnJvcnMpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIk11dGF0aW9uIGFkZGluZyBjb21tZW50IHRvIGRpc2N1c3Npb24gZmFpbGVkIHdpdGggZXJyb3JcIik7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgbWFya0Rpc2N1c3Npb25Db21tZW50QXNBbnN3ZXIoY29tbWVudElkOiBzdHJpbmcpIHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmdpdGh1YkNsaWVudC5tdXRhdGU8TWFya0Rpc2N1c3Npb25Db21tZW50QXNBbnN3ZXJNdXRhdGlvbj4oe1xuICAgICAgbXV0YXRpb246IE1hcmtEaXNjdXNzaW9uQ29tbWVudEFzQW5zd2VyLFxuICAgICAgdmFyaWFibGVzOiB7XG4gICAgICAgIGNvbW1lbnRJZFxuICAgICAgfVxuICAgIH0pO1xuICBcbiAgICBpZiAocmVzdWx0LmVycm9ycykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRXJyb3IgaW4gbXV0YXRpb24gb2YgbWFya2luZyBjb21tZW50IGFzIGFuc3dlciwgY2FuIG5vdCBwcm9jZWVkXCIpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgYXN5bmMgYWRkQXR0ZW50aW9uTGFiZWxUb0Rpc2N1c3Npb24oZGlzY3Vzc2lvbklkOiBzdHJpbmcpIHtcblxuICAgIGlmIChkaXNjdXNzaW9uSWQgPT09IFwiXCIpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgZGlzY3Vzc2lvbiBpZCwgY2FuIG5vdCBwcm9jZWVkIVwiKTtcbiAgICB9XG4gIFxuICAgIGNvcmUuZGVidWcoXCJkaXNjdXNzaW9uIGlkIDogXCIgKyBkaXNjdXNzaW9uSWQgKyBcIiAgbGFiZWxpZCA6IFwiICsgdGhpcy5hdHRlbnRpb25MYWJlbElkKTtcbiAgXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5naXRodWJDbGllbnQubXV0YXRlPEFkZExhYmVsVG9EaXNjdXNzaW9uTXV0YXRpb24+KHtcbiAgICAgIG11dGF0aW9uOiBBZGRMYWJlbFRvRGlzY3Vzc2lvbixcbiAgICAgIHZhcmlhYmxlczoge1xuICAgICAgICBsYWJlbGFibGVJZDogZGlzY3Vzc2lvbklkLFxuICAgICAgICBsYWJlbElkczogdGhpcy5hdHRlbnRpb25MYWJlbElkLFxuICAgICAgfVxuICAgIH0pO1xuICBcbiAgICBpZiAocmVzdWx0LmVycm9ycykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRXJyb3IgaW4gbXV0YXRpb24gb2YgYWRkaW5nIGxhYmVsIHRvIGRpc2N1c3Npb24sIGNhbiBub3QgcHJvY2VlZCFcIik7XG4gICAgfVxuICBcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgYXN5bmMgdXBkYXRlRGlzY3Vzc2lvbkNvbW1lbnQoY29tbWVudElkOiBzdHJpbmcsIGJvZHk6IHN0cmluZykge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZ2l0aHViQ2xpZW50Lm11dGF0ZTxVcGRhdGVEaXNjdXNzaW9uQ29tbWVudE11dGF0aW9uPih7XG4gICAgICBtdXRhdGlvbjogVXBkYXRlRGlzY3Vzc2lvbkNvbW1lbnQsXG4gICAgICB2YXJpYWJsZXM6IHtcbiAgICAgICAgY29tbWVudElkLFxuICAgICAgICBib2R5XG4gICAgICB9XG4gICAgfSk7XG4gIFxuICAgIGlmIChyZXN1bHQuZXJyb3JzKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJFcnJvciBpbiB1cGRhdGluZyBkaXNjdXNzaW9uIGNvbW1lbnRcIik7XG4gICAgfVxuICBcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG59XG4iXX0=