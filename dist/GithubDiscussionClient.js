"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GithubDiscussionClient = void 0;
const core_1 = require("@apollo/client/core");
const core = require("@actions/core");
const cross_fetch_1 = require("cross-fetch");
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
                    fetch: cross_fetch_1.default
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiR2l0aHViRGlzY3Vzc2lvbkNsaWVudC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9HaXRodWJEaXNjdXNzaW9uQ2xpZW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLDhDQUFtRztBQUNuRyxzQ0FBc0M7QUFDdEMsNkNBQWdDO0FBRWhDLGlEQUFzckI7QUFFdHJCLE1BQU0sZ0JBQWdCLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsa0JBQWtCLEVBQUUsRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUMvRixNQUFNLGdCQUFnQixHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLGtCQUFrQixFQUFFLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUM7QUFFL0YsTUFBYSxzQkFBc0I7SUFPakMsWUFBWSxLQUFhLEVBQUUsSUFBWTtRQUNyQyxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLGNBQWMsRUFBRSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsQ0FBQyxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDO1FBQ25HLElBQUksQ0FBQyxXQUFXLEVBQUU7WUFDaEIsTUFBTSxJQUFJLEtBQUssQ0FBQyxnSUFBZ0ksQ0FBQyxDQUFDO1NBQ25KO2FBQU07WUFDTCxJQUFJLENBQUMsV0FBVyxHQUFHLFdBQVcsQ0FBQztTQUNoQztRQUVELElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztJQUN6QixDQUFDO0lBRUQsZUFBZTtRQUNiLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFO1lBQ3RCLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxtQkFBWSxDQUFDO2dCQUNuQyxJQUFJLEVBQUUsSUFBSSxlQUFRLENBQUM7b0JBQ2pCLEdBQUcsRUFBRSxnQ0FBZ0M7b0JBQ3JDLE9BQU8sRUFB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QUFDLHlDQUF5QyxDQUFDLENBQUM7U0FDNUQ7UUFFRCxJQUFJLENBQUMsS0FBSyxDQUFDLGtCQUFrQixHQUFHLFlBQVksR0FBRyxjQUFjLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFFdkYsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBK0I7WUFDMUUsUUFBUSxFQUFFLDhCQUFvQjtZQUM5QixTQUFTLEVBQUU7Z0JBQ1QsV0FBVyxFQUFFLFlBQVk7Z0JBQ3pCLFFBQVEsRUFBRSxJQUFJLENBQUMsZ0JBQWdCO2FBQ2hDO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsSUFBSSxNQUFNLENBQUMsTUFBTSxFQUFFO1lBQ2pCLE1BQU0sSUFBSSxLQUFLLENBQUMsbUVBQW1FLENBQUMsQ0FBQztTQUN0RjtRQUVELE9BQU8sTUFBTSxDQUFDO0lBQ2hCLENBQUM7SUFFRCxLQUFLLENBQUMsdUJBQXVCLENBQUMsU0FBaUIsRUFBRSxJQUFZO1FBQzNELE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQWtDO1lBQzdFLFFBQVEsRUFBRSxpQ0FBdUI7WUFDakMsU0FBUyxFQUFFO2dCQUNULFNBQVM7Z0JBQ1QsSUFBSTthQUNMO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsSUFBSSxNQUFNLENBQUMsTUFBTSxFQUFFO1lBQ2pCLE1BQU0sSUFBSSxLQUFLLENBQUMsc0NBQXNDLENBQUMsQ0FBQztTQUN6RDtRQUVELE9BQU8sTUFBTSxDQUFDO0lBQ2hCLENBQUM7Q0FDRjtBQXZSRCx3REF1UkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBcG9sbG9DbGllbnQsIEh0dHBMaW5rLCBJbk1lbW9yeUNhY2hlLCBOb3JtYWxpemVkQ2FjaGVPYmplY3QgfSBmcm9tIFwiQGFwb2xsby9jbGllbnQvY29yZVwiO1xuaW1wb3J0ICogYXMgY29yZSBmcm9tICdAYWN0aW9ucy9jb3JlJztcbmltcG9ydCBmZXRjaCBmcm9tICdjcm9zcy1mZXRjaCc7XG5pbXBvcnQgeyBEaXNjdXNzaW9uQ29ubmVjdGlvbiB9IGZyb20gXCJAb2N0b2tpdC9ncmFwaHFsLXNjaGVtYVwiO1xuaW1wb3J0IHsgR2V0RGlzY3Vzc2lvbkNvdW50UXVlcnksIEdldERpc2N1c3Npb25Db3VudFF1ZXJ5VmFyaWFibGVzLCBHZXREaXNjdXNzaW9uQ291bnQsIEdldERpc2N1c3Npb25EYXRhUXVlcnksIEdldERpc2N1c3Npb25EYXRhUXVlcnlWYXJpYWJsZXMsIEdldERpc2N1c3Npb25EYXRhLCBHZXRBbnN3ZXJhYmxlRGlzY3Vzc2lvbklkUXVlcnksIEdldEFuc3dlcmFibGVEaXNjdXNzaW9uSWRRdWVyeVZhcmlhYmxlcywgR2V0QW5zd2VyYWJsZURpc2N1c3Npb25JZCwgR2V0TGFiZWxJZFF1ZXJ5LCBHZXRMYWJlbElkLCBDbG9zZURpc2N1c3Npb25Bc1Jlc29sdmVkTXV0YXRpb24sIENsb3NlRGlzY3Vzc2lvbkFzUmVzb2x2ZWQsIENsb3NlRGlzY3Vzc2lvbkFzT3V0ZGF0ZWRNdXRhdGlvbiwgQ2xvc2VEaXNjdXNzaW9uQXNPdXRkYXRlZCwgQWRkRGlzY3Vzc2lvbkNvbW1lbnRNdXRhdGlvbiwgQWRkRGlzY3Vzc2lvbkNvbW1lbnQsIE1hcmtEaXNjdXNzaW9uQ29tbWVudEFzQW5zd2VyTXV0YXRpb24sIE1hcmtEaXNjdXNzaW9uQ29tbWVudEFzQW5zd2VyLCBBZGRMYWJlbFRvRGlzY3Vzc2lvbk11dGF0aW9uLCBBZGRMYWJlbFRvRGlzY3Vzc2lvbiwgVXBkYXRlRGlzY3Vzc2lvbkNvbW1lbnRNdXRhdGlvbiwgVXBkYXRlRGlzY3Vzc2lvbkNvbW1lbnQsIFJlYWN0aW9uQ29udGVudCB9IGZyb20gXCIuL2dlbmVyYXRlZC9ncmFwaHFsXCI7XG5cbmNvbnN0IERBWVNfVU5USUxfU1RBTEUgPSBwYXJzZUludChjb3JlLmdldElucHV0KCdkYXlzLXVudGlsLXN0YWxlJywgeyByZXF1aXJlZDogZmFsc2UgfSkpIHx8IDc7XG5jb25zdCBEQVlTX1VOVElMX0NMT1NFID0gcGFyc2VJbnQoY29yZS5nZXRJbnB1dCgnZGF5cy11bnRpbC1jbG9zZScsIHsgcmVxdWlyZWQ6IGZhbHNlIH0pKSB8fCA0O1xuXG5leHBvcnQgY2xhc3MgR2l0aHViRGlzY3Vzc2lvbkNsaWVudCB7XG4gIHB1YmxpYyBnaXRodWJDbGllbnQ6IEFwb2xsb0NsaWVudDxOb3JtYWxpemVkQ2FjaGVPYmplY3Q+O1xuICBwcml2YXRlIGdpdGh1YlRva2VuOiBzdHJpbmc7XG4gIHByaXZhdGUgb3duZXI6IHN0cmluZztcbiAgcHJpdmF0ZSByZXBvOiBzdHJpbmc7XG4gIHByaXZhdGUgYXR0ZW50aW9uTGFiZWxJZDogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKG93bmVyOiBzdHJpbmcsIHJlcG86IHN0cmluZykge1xuICAgIGNvbnN0IGdpdGh1YlRva2VuID0gY29yZS5nZXRJbnB1dCgnZ2l0aHViLXRva2VuJywgeyByZXF1aXJlZDogZmFsc2UgfSkgfHwgcHJvY2Vzcy5lbnYuR0lUSFVCX1RPS0VOO1xuICAgIGlmICghZ2l0aHViVG9rZW4pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignWW91IG11c3QgcHJvdmlkZSBhIEdpdEh1YiB0b2tlbiBhcyBhbiBpbnB1dCB0byB0aGlzIGFjdGlvbiwgb3IgYXMgYSBgR0lUSFVCX1RPS0VOYCBlbnYgdmFyaWFibGUuIFNlZSB0aGUgUkVBRE1FIGZvciBtb3JlIGluZm8uJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuZ2l0aHViVG9rZW4gPSBnaXRodWJUb2tlbjtcbiAgICB9XG5cbiAgICB0aGlzLmdldEdpdGh1YkNsaWVudCgpO1xuICB9XG5cbiAgZ2V0R2l0aHViQ2xpZW50KCk6IEFwb2xsb0NsaWVudDxOb3JtYWxpemVkQ2FjaGVPYmplY3Q+IHtcbiAgICBpZiAoIXRoaXMuZ2l0aHViQ2xpZW50KSB7XG4gICAgICB0aGlzLmdpdGh1YkNsaWVudCA9IG5ldyBBcG9sbG9DbGllbnQoe1xuICAgICAgICBsaW5rOiBuZXcgSHR0cExpbmsoe1xuICAgICAgICAgIHVyaTogXCJodHRwczovL2FwaS5naXRodWIuY29tL2dyYXBocWxcIixcbiAgICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgICBhdXRob3JpemF0aW9uOiBgdG9rZW4gJHt0aGlzLmdpdGh1YlRva2VufWAsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBmZXRjaFxuICAgICAgICB9KSxcbiAgICAgICAgY2FjaGU6IG5ldyBJbk1lbW9yeUNhY2hlKCksXG4gICAgICB9KTtcbiAgICAgIHJldHVybiB0aGlzLmdpdGh1YkNsaWVudDtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHRoaXMuZ2l0aHViQ2xpZW50O1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGNsb3NlRGlzY3Vzc2lvbnNJbkFic2VuY2VPZlJlYWN0aW9uKGNvbW1lbnREYXRlOiBEYXRlLCBkaXNjdXNzaW9uSWQ6IHN0cmluZykge1xuICAgIGNvbnN0IGN1cnJlbnREYXRlOiBEYXRlID0gbmV3IERhdGUoKTtcbiAgICBjb25zdCBkaWZmSW5NczogbnVtYmVyID0gY3VycmVudERhdGUuZ2V0VGltZSgpIC0gY29tbWVudERhdGUuZ2V0VGltZSgpO1xuICAgIGNvbnN0IGRpZmZJbkRheXM6IG51bWJlciA9IE1hdGguZmxvb3IoZGlmZkluTXMgLyAoMTAwMCAqIDYwICogNjAgKiAyNCkpO1xuICBcbiAgICBjb3JlLmRlYnVnKGBjdXJyZW50IGRhdGU6ICR7Y3VycmVudERhdGV9IGFuZCB0aGUgY29tbWVudCBkYXRlIDogJHtjb21tZW50RGF0ZX1gKTtcbiAgICBpZiAoKGRpZmZJbkRheXMgPj0gREFZU19VTlRJTF9DTE9TRSkpIHtcbiAgICAgIGNvcmUuaW5mbyhcIkRpc2N1c3Npb24gYXV0aG9yIGhhcyBub3QgcmVzcG9uZGVkIGluIGEgd2hpbGUsIHNvIGNsb3NpbmcgdGhlIGRpc2N1c3Npb25cIik7XG4gICAgICBjb25zdCBjbG9zZUZvclN0YWxlbmVzc1Jlc3BvbnNlVGV4dCA9IFwiQ2xvc2luZyB0aGUgZGlzY3Vzc2lvbiBmb3Igc3RhbGVuZXNzXCI7XG4gICAgICBjb3JlLmRlYnVnKFwiUmVzcG9uc2V0ZXh0OiBcIiArIGNsb3NlRm9yU3RhbGVuZXNzUmVzcG9uc2VUZXh0KTtcbiAgICAgIHRoaXMuYWRkQ29tbWVudFRvRGlzY3Vzc2lvbihkaXNjdXNzaW9uSWQsIGNsb3NlRm9yU3RhbGVuZXNzUmVzcG9uc2VUZXh0KTtcbiAgICAgIHRoaXMuY2xvc2VEaXNjdXNzaW9uQXNPdXRkYXRlZChkaXNjdXNzaW9uSWQpO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIHRyaWdnZXJSZWFjdGlvbkNvbnRlbnRCYXNlZEFjdGlvbihjb250ZW50OiBSZWFjdGlvbkNvbnRlbnQsIGJvZHlUZXh0OiBzdHJpbmcsIGRpc2N1c3Npb25JZDogc3RyaW5nLCBjb21tZW50SWQ6IHN0cmluZywgcHJvcG9zZWRBbnN3ZXJUZXh0OiBzdHJpbmcpIHtcbiAgICBjb3JlLmRlYnVnKFwiUHJpbnRpbmcgY29udGVudCByZWFjdGlvbiA6ICBcIiArIGNvbnRlbnQpO1xuICBcbiAgICBpZiAoY29udGVudC5sZW5ndGggPT09IDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIk51bGwgY29udGVudCByZWFjdGlvbiByZWNlaXZlZCwgY2FuIG5vdCBwcm9jZWVkXCIpO1xuICAgIH1cbiAgXG4gICAgaWYgKChjb250ZW50ID09PSBSZWFjdGlvbkNvbnRlbnQuVGh1bWJzVXApIHx8IChjb250ZW50ID09PSBSZWFjdGlvbkNvbnRlbnQuSGVhcnQpIHx8IChjb250ZW50ID09PSBSZWFjdGlvbkNvbnRlbnQuSG9vcmF5KSB8fCAoY29udGVudCA9PT0gUmVhY3Rpb25Db250ZW50LkxhdWdoKSB8fCAoY29udGVudCA9PT0gUmVhY3Rpb25Db250ZW50LlJvY2tldCkpIHtcbiAgICAgIGNvcmUuaW5mbyhcIlBvc2l0aXZlIHJlYWN0aW9uIHJlY2VpdmVkLiBNYXJraW5nIGRpc2N1c3Npb24gYXMgYW5zd2VyZWRcIik7XG4gIFxuICAgICAgLy9yZW1vdmUgdGhlIGtleXdvcmQgZnJvbSB0aGUgY29tbWVudCBhbmQgdXBhdGUgY29tbWVudFxuICAgICAgY29uc3QgdXBkYXRlZFRleHQgPSBib2R5VGV4dC5yZXBsYWNlKHByb3Bvc2VkQW5zd2VyVGV4dCwgJ0Fuc3dlcjogJyk7XG4gICAgICBjb3JlLmRlYnVnKFwidXBkYXRlZCB0ZXh0IDpcIiArIHVwZGF0ZWRUZXh0KTtcbiAgICAgIGF3YWl0IHRoaXMudXBkYXRlRGlzY3Vzc2lvbkNvbW1lbnQoY29tbWVudElkLCB1cGRhdGVkVGV4dCEpO1xuICAgICAgYXdhaXQgdGhpcy5tYXJrRGlzY3Vzc2lvbkNvbW1lbnRBc0Fuc3dlcihjb21tZW50SWQpO1xuICAgICAgYXdhaXQgdGhpcy5jbG9zZURpc2N1c3Npb25Bc1Jlc29sdmVkKGRpc2N1c3Npb25JZCk7XG4gICAgfVxuICAgIGVsc2UgaWYgKChjb250ZW50ID09PSBSZWFjdGlvbkNvbnRlbnQuVGh1bWJzRG93bikgfHwgKGNvbnRlbnQgPT09IFJlYWN0aW9uQ29udGVudC5Db25mdXNlZCkpIHtcbiAgICAgIGNvcmUuaW5mbyhcIk5lZ2F0aXZlIHJlYWN0aW9uIHJlY2VpdmVkLiBBZGRpbmcgYXR0ZW50aW9uIGxhYmVsIHRvIHJlY2VpdmUgZnVydGhlciBhdHRlbnRpb24gZnJvbSBhIHJlcG9zaXRvcnkgbWFpbnRhaW5lclwiKTtcbiAgICAgIGF3YWl0IHRoaXMuYWRkQXR0ZW50aW9uTGFiZWxUb0Rpc2N1c3Npb24oZGlzY3Vzc2lvbklkKTtcbiAgICB9XG4gIH1cblxuICBhc3luYyByZW1pbmRBdXRob3JGb3JBY3Rpb24oY29tbWVudERhdGU6IERhdGUsIGF1dGhvcjogc3RyaW5nLCBkaXNjdXNzaW9uSWQ6IHN0cmluZywgcmVtaW5kUmVzcG9uc2VUZXh0OiBzdHJpbmcpIHtcbiAgICBjb25zdCBjdXJyZW50RGF0ZTogRGF0ZSA9IG5ldyBEYXRlKCk7XG4gICAgY29uc3QgZGlmZkluTXM6IG51bWJlciA9IGN1cnJlbnREYXRlLmdldFRpbWUoKSAtIGNvbW1lbnREYXRlLmdldFRpbWUoKTtcbiAgICBjb25zdCBkaWZmSW5IcnM6IG51bWJlciA9IE1hdGguZmxvb3IoZGlmZkluTXMgLyAoMTAwMCAqIDYwICogNjApKTtcbiAgICBjb25zdCBkaWZmSW5EYXlzOiBudW1iZXIgPSBNYXRoLmZsb29yKGRpZmZJbk1zIC8gKDEwMDAgKiA2MCAqIDYwICogMjQpKTtcbiAgXG4gICAgY29yZS5kZWJ1ZyhgY3VycmVudCBkYXRlOiAke2N1cnJlbnREYXRlfSBhbmQgdGhlIGNvbW1lbnQgZGF0ZSA6ICR7Y29tbWVudERhdGV9YCk7XG4gICAgY29yZS5kZWJ1ZyhgQW5zd2VyIHdhcyBwcm9wb3NlZCAke2RpZmZJbkRheXN9IGRheXMgYW5kICR7ZGlmZkluSHJzfSBocnMgYWdvLmApO1xuICBcbiAgICBpZiAoKGRpZmZJbkRheXMgPj0gREFZU19VTlRJTF9TVEFMRSkpIHtcbiAgICAgIGNvbnN0IHJlbWluZEF1dGhvclJlc3BvbnNlVGV4dCA9IFwiSGV5IEBcIiArIGF1dGhvciArIFwiLCBcIiArIHJlbWluZFJlc3BvbnNlVGV4dDtcbiAgICAgIGNvcmUuZGVidWcoXCJSZXNwb25zZXRleHQ6IFwiICsgcmVtaW5kQXV0aG9yUmVzcG9uc2VUZXh0KTtcbiAgICAgIGF3YWl0IHRoaXMuYWRkQ29tbWVudFRvRGlzY3Vzc2lvbihkaXNjdXNzaW9uSWQsIHJlbWluZEF1dGhvclJlc3BvbnNlVGV4dCk7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgZ2V0VG90YWxEaXNjdXNzaW9uQ291bnQoY2F0ZWdvcnlJRDogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzdWx0Q291bnRPYmplY3QgPSBhd2FpdCB0aGlzLmdpdGh1YkNsaWVudC5xdWVyeTxHZXREaXNjdXNzaW9uQ291bnRRdWVyeSwgR2V0RGlzY3Vzc2lvbkNvdW50UXVlcnlWYXJpYWJsZXM+KHtcbiAgICAgIHF1ZXJ5OiBHZXREaXNjdXNzaW9uQ291bnQsXG4gICAgICB2YXJpYWJsZXM6IHtcbiAgICAgICAgb3duZXI6IHRoaXMub3duZXIsXG4gICAgICAgIG5hbWU6IHRoaXMucmVwbyxcbiAgICAgICAgY2F0ZWdvcnlJZDogY2F0ZWdvcnlJRFxuICAgICAgfSxcbiAgICB9KTtcbiAgXG4gICAgaWYgKHJlc3VsdENvdW50T2JqZWN0LmVycm9yKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJFcnJvciBpbiByZWFkaW5nIGRpc2N1c3Npb25zIGNvdW50XCIpO1xuICAgIH1cbiAgXG4gICAgY29yZS5kZWJ1ZyhgVG90YWwgZGlzY3Vzc2lvbiBjb3VudCA6ICR7cmVzdWx0Q291bnRPYmplY3QuZGF0YS5yZXBvc2l0b3J5Py5kaXNjdXNzaW9ucy50b3RhbENvdW50fWApO1xuICAgIHJldHVybiByZXN1bHRDb3VudE9iamVjdC5kYXRhLnJlcG9zaXRvcnk/LmRpc2N1c3Npb25zLnRvdGFsQ291bnQ7XG4gIH1cblxuICBhc3luYyBnZXREaXNjdXNzaW9uc01ldGFEYXRhKGNhdGVnb3J5SUQ6IHN0cmluZyk6IFByb21pc2U8RGlzY3Vzc2lvbkNvbm5lY3Rpb24+IHtcbiAgICBjb25zdCBkaXNjdXNzaW9uc0NvdW50ID0gYXdhaXQgdGhpcy5nZXRUb3RhbERpc2N1c3Npb25Db3VudChjYXRlZ29yeUlEKTtcbiAgXG4gICAgY29uc3QgZGlzY3Vzc2lvbnMgPSBhd2FpdCB0aGlzLmdpdGh1YkNsaWVudC5xdWVyeTxHZXREaXNjdXNzaW9uRGF0YVF1ZXJ5LCBHZXREaXNjdXNzaW9uRGF0YVF1ZXJ5VmFyaWFibGVzPih7XG4gICAgICBxdWVyeTogR2V0RGlzY3Vzc2lvbkRhdGEsXG4gICAgICB2YXJpYWJsZXM6IHtcbiAgICAgICAgb3duZXI6IHRoaXMub3duZXIsXG4gICAgICAgIG5hbWU6IHRoaXMucmVwbyxcbiAgICAgICAgY2F0ZWdvcnlJRDogY2F0ZWdvcnlJRCxcbiAgICAgICAgY291bnQ6IGRpc2N1c3Npb25zQ291bnQsXG4gICAgICB9LFxuICAgIH0pXG4gIFxuICAgIGlmIChkaXNjdXNzaW9ucy5lcnJvcikgeyB0aHJvdyBuZXcgRXJyb3IoXCJFcnJvciBpbiByZXRyaWV2aW5nIGRpc2N1c3Npb25zIG1ldGFkYXRhXCIpOyB9XG4gIFxuICAgIC8vaXRlcmF0ZSBvdmVyIGVhY2ggZGlzY3Vzc2lvbiB0byBwcm9jZXNzIGJvZHkgdGV4dC9jb21tZW50cy9yZWFjdGlvbnNcbiAgICByZXR1cm4gZGlzY3Vzc2lvbnMuZGF0YS5yZXBvc2l0b3J5Py5kaXNjdXNzaW9ucyBhcyBEaXNjdXNzaW9uQ29ubmVjdGlvbjtcbiAgfVxuXG4gIGFzeW5jIGdldEFuc3dlcmFibGVEaXNjdXNzaW9uQ2F0ZWdvcnlJRHMoKTogUHJvbWlzZTxhbnk+IHtcblxuICAgIGNvbnN0IGFuc3dlcmFibGVDYXRlZ29yeUlEczogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmdpdGh1YkNsaWVudC5xdWVyeTxHZXRBbnN3ZXJhYmxlRGlzY3Vzc2lvbklkUXVlcnksIEdldEFuc3dlcmFibGVEaXNjdXNzaW9uSWRRdWVyeVZhcmlhYmxlcz4oe1xuICAgICAgcXVlcnk6IEdldEFuc3dlcmFibGVEaXNjdXNzaW9uSWQsXG4gICAgICB2YXJpYWJsZXM6IHtcbiAgICAgICAgb3duZXI6IHRoaXMub3duZXIsXG4gICAgICAgIG5hbWU6IHRoaXMucmVwb1xuICAgICAgfSxcbiAgICB9KTtcbiAgXG4gICAgaWYgKCFyZXN1bHQuZGF0YS5yZXBvc2l0b3J5KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYENvdWxkbid0IGZpbmQgcmVwb3NpdG9yeSBpZCFgKTtcbiAgICB9XG4gIFxuICAgIC8vaXRlcmF0ZSBvdmVyIGRpc2N1c3Npb24gY2F0ZWdvcmllcyB0byBnZXQgdGhlIGlkIGZvciBhbnN3ZXJhYmxlIG9uZVxuICAgIHJlc3VsdC5kYXRhLnJlcG9zaXRvcnkuZGlzY3Vzc2lvbkNhdGVnb3JpZXMuZWRnZXM/LmZvckVhY2goZWxlbWVudCA9PiB7XG4gICAgICBpZiAoZWxlbWVudD8ubm9kZT8uaXNBbnN3ZXJhYmxlID09IHRydWUpIHtcbiAgICAgICAgYW5zd2VyYWJsZUNhdGVnb3J5SURzLnB1c2goZWxlbWVudD8ubm9kZT8uaWQpO1xuICAgICAgfVxuICAgIH0pXG4gIFxuICAgIGlmIChhbnN3ZXJhYmxlQ2F0ZWdvcnlJRHMubGVuZ3RoID09PSAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJUaGVyZSBhcmUgbm8gQW5zd2VyYWJsZSBjYXRlZ29yeSBkaXNjdXNzaW9ucyBpbiB0aGlzIHJlcG9zaXRvcnlcIik7XG4gICAgfVxuICBcbiAgICByZXR1cm4gYW5zd2VyYWJsZUNhdGVnb3J5SURzO1xuICB9XG5cbiAgYXN5bmMgZ2V0QXR0ZW50aW9uTGFiZWxJZChsYWJlbDogc3RyaW5nKSB7XG4gICAgaWYgKCF0aGlzLmF0dGVudGlvbkxhYmVsSWQpIHtcbiAgICAgIGNvbnN0IGF0dGVudGlvbkxhYmVsID0gY29yZS5nZXRJbnB1dCgnYXR0ZW50aW9uLWxhYmVsJywgeyByZXF1aXJlZDogZmFsc2UgfSkgfHwgJ2F0dGVudGlvbic7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmdpdGh1YkNsaWVudC5xdWVyeTxHZXRMYWJlbElkUXVlcnk+KHtcbiAgICAgICAgcXVlcnk6IEdldExhYmVsSWQsXG4gICAgICAgIHZhcmlhYmxlczoge1xuICAgICAgICAgIG93bmVyOiB0aGlzLm93bmVyLFxuICAgICAgICAgIG5hbWU6IHRoaXMucmVwbyxcbiAgICAgICAgICBsYWJlbE5hbWU6IGxhYmVsXG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIFxuICAgICAgaWYgKCFyZXN1bHQuZGF0YS5yZXBvc2l0b3J5Py5sYWJlbD8uaWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDb3VsZG4ndCBmaW5kIG1lbnRpb25lZCBMYWJlbCFgKTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5hdHRlbnRpb25MYWJlbElkID0gcmVzdWx0LmRhdGEucmVwb3NpdG9yeT8ubGFiZWw/LmlkO1xuICAgICAgcmV0dXJuIHRoaXMuYXR0ZW50aW9uTGFiZWxJZDtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHRoaXMuYXR0ZW50aW9uTGFiZWxJZDtcbiAgICB9XG4gIH1cblxuICBhc3luYyBjbG9zZURpc2N1c3Npb25Bc1Jlc29sdmVkKGRpc2N1c3Npb25JZDogc3RyaW5nKSB7XG4gICAgY29yZS5pbmZvKFwiQ2xvc2luZyBkaXNjdXNzaW9uIGFzIHJlc29sdmVkXCIpO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZ2l0aHViQ2xpZW50Lm11dGF0ZTxDbG9zZURpc2N1c3Npb25Bc1Jlc29sdmVkTXV0YXRpb24+KHtcbiAgICAgIG11dGF0aW9uOiBDbG9zZURpc2N1c3Npb25Bc1Jlc29sdmVkLFxuICAgICAgdmFyaWFibGVzOiB7XG4gICAgICAgIGRpc2N1c3Npb25JZFxuICAgICAgfVxuICAgIH0pO1xuICBcbiAgICBpZiAocmVzdWx0LmVycm9ycykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRXJyb3IgaW4gcmV0cmlldmluZyByZXN1bHQgZGlzY3Vzc2lvbiBpZFwiKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdC5kYXRhPy5jbG9zZURpc2N1c3Npb24/LmRpc2N1c3Npb24/LmlkO1xuICB9XG5cbiAgYXN5bmMgY2xvc2VEaXNjdXNzaW9uQXNPdXRkYXRlZChkaXNjdXNzaW9uSWQ6IHN0cmluZykge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZ2l0aHViQ2xpZW50Lm11dGF0ZTxDbG9zZURpc2N1c3Npb25Bc091dGRhdGVkTXV0YXRpb24+KHtcbiAgICAgIG11dGF0aW9uOiBDbG9zZURpc2N1c3Npb25Bc091dGRhdGVkLFxuICAgICAgdmFyaWFibGVzOiB7XG4gICAgICAgIGRpc2N1c3Npb25JZFxuICAgICAgfVxuICAgIH0pO1xuICBcbiAgICBpZiAocmVzdWx0LmVycm9ycykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRXJyb3IgaW4gY2xvc2luZyBvdXRkYXRlZCBkaXNjdXNzaW9uXCIpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0LmRhdGE/LmNsb3NlRGlzY3Vzc2lvbj8uZGlzY3Vzc2lvbj8uaWQ7XG4gIH1cblxuICBhc3luYyBhZGRDb21tZW50VG9EaXNjdXNzaW9uKGRpc2N1c3Npb25JZDogc3RyaW5nLCBib2R5OiBzdHJpbmcpIHtcbiAgICBpZiAoZGlzY3Vzc2lvbklkID09PSBcIlwiKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYENvdWxkbid0IGNyZWF0ZSBjb21tZW50IGFzIGRpc2N1c3Npb25JZCBpcyBudWxsIWApO1xuICAgIH1cbiAgXG4gICAgY29yZS5kZWJ1ZyhcImRpc2N1c3Npb25JRCA6OiBcIiArIGRpc2N1c3Npb25JZCArIFwiIGJvZHlUZXh0IDo6XCIgKyBib2R5KTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmdpdGh1YkNsaWVudC5tdXRhdGU8QWRkRGlzY3Vzc2lvbkNvbW1lbnRNdXRhdGlvbj4oe1xuICAgICAgbXV0YXRpb246IEFkZERpc2N1c3Npb25Db21tZW50LFxuICAgICAgdmFyaWFibGVzOiB7XG4gICAgICAgIGRpc2N1c3Npb25JZCxcbiAgICAgICAgYm9keSxcbiAgICAgIH0sXG4gICAgfSk7XG4gIFxuICAgIGlmIChyZXN1bHQuZXJyb3JzKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJNdXRhdGlvbiBhZGRpbmcgY29tbWVudCB0byBkaXNjdXNzaW9uIGZhaWxlZCB3aXRoIGVycm9yXCIpO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIG1hcmtEaXNjdXNzaW9uQ29tbWVudEFzQW5zd2VyKGNvbW1lbnRJZDogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5naXRodWJDbGllbnQubXV0YXRlPE1hcmtEaXNjdXNzaW9uQ29tbWVudEFzQW5zd2VyTXV0YXRpb24+KHtcbiAgICAgIG11dGF0aW9uOiBNYXJrRGlzY3Vzc2lvbkNvbW1lbnRBc0Fuc3dlcixcbiAgICAgIHZhcmlhYmxlczoge1xuICAgICAgICBjb21tZW50SWRcbiAgICAgIH1cbiAgICB9KTtcbiAgXG4gICAgaWYgKHJlc3VsdC5lcnJvcnMpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkVycm9yIGluIG11dGF0aW9uIG9mIG1hcmtpbmcgY29tbWVudCBhcyBhbnN3ZXIsIGNhbiBub3QgcHJvY2VlZFwiKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGFzeW5jIGFkZEF0dGVudGlvbkxhYmVsVG9EaXNjdXNzaW9uKGRpc2N1c3Npb25JZDogc3RyaW5nKSB7XG5cbiAgICBpZiAoZGlzY3Vzc2lvbklkID09PSBcIlwiKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJJbnZhbGlkIGRpc2N1c3Npb24gaWQsIGNhbiBub3QgcHJvY2VlZCFcIik7XG4gICAgfVxuICBcbiAgICBjb3JlLmRlYnVnKFwiZGlzY3Vzc2lvbiBpZCA6IFwiICsgZGlzY3Vzc2lvbklkICsgXCIgIGxhYmVsaWQgOiBcIiArIHRoaXMuYXR0ZW50aW9uTGFiZWxJZCk7XG4gIFxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZ2l0aHViQ2xpZW50Lm11dGF0ZTxBZGRMYWJlbFRvRGlzY3Vzc2lvbk11dGF0aW9uPih7XG4gICAgICBtdXRhdGlvbjogQWRkTGFiZWxUb0Rpc2N1c3Npb24sXG4gICAgICB2YXJpYWJsZXM6IHtcbiAgICAgICAgbGFiZWxhYmxlSWQ6IGRpc2N1c3Npb25JZCxcbiAgICAgICAgbGFiZWxJZHM6IHRoaXMuYXR0ZW50aW9uTGFiZWxJZCxcbiAgICAgIH1cbiAgICB9KTtcbiAgXG4gICAgaWYgKHJlc3VsdC5lcnJvcnMpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkVycm9yIGluIG11dGF0aW9uIG9mIGFkZGluZyBsYWJlbCB0byBkaXNjdXNzaW9uLCBjYW4gbm90IHByb2NlZWQhXCIpO1xuICAgIH1cbiAgXG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGFzeW5jIHVwZGF0ZURpc2N1c3Npb25Db21tZW50KGNvbW1lbnRJZDogc3RyaW5nLCBib2R5OiBzdHJpbmcpIHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmdpdGh1YkNsaWVudC5tdXRhdGU8VXBkYXRlRGlzY3Vzc2lvbkNvbW1lbnRNdXRhdGlvbj4oe1xuICAgICAgbXV0YXRpb246IFVwZGF0ZURpc2N1c3Npb25Db21tZW50LFxuICAgICAgdmFyaWFibGVzOiB7XG4gICAgICAgIGNvbW1lbnRJZCxcbiAgICAgICAgYm9keVxuICAgICAgfVxuICAgIH0pO1xuICBcbiAgICBpZiAocmVzdWx0LmVycm9ycykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRXJyb3IgaW4gdXBkYXRpbmcgZGlzY3Vzc2lvbiBjb21tZW50XCIpO1xuICAgIH1cbiAgXG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxufVxuIl19