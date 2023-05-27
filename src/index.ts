import { DiscussionCommentConnection, DiscussionConnection } from '@octokit/graphql-schema';
import * as github from '@actions/github';
import * as core from '@actions/core';
import { GithubDiscussionClient } from "./GithubDiscussionClient";
import { ReactionContent } from "./generated/graphql";

const PROPOSED_ANSWER_TEXT = '@bot proposed-answer';
const STALE_DISCUSSION_REMINDER_RESPONSE = 'please take a look at the suggested answer. If you want to keep this discussion open, please provide a response.'

async function main() {
  const owner = github.context.repo.owner;
  const repo = github.context.repo.repo;
  const githubClient = new GithubDiscussionClient(owner, repo);

  // Iterate over all answerable discussion categories in repo
  const discussionCategoryIDList: string[] = await githubClient.getAnswerableDiscussionCategoryIDs();
  for (const discussionCategoryID of discussionCategoryIDList) {
    core.debug(`Iterating over discussionCategoryID : ${discussionCategoryID}`);

    //Get all unlocked discussions and iterate to check all conditions and take action
    const discussions = await githubClient.getDiscussionsMetaData(discussionCategoryID);
    await processDiscussions(discussions, githubClient);
  }
}

export async function processDiscussions(discussions: DiscussionConnection, githubClient: GithubDiscussionClient) {
  discussions.edges?.map(async discussion => {
    var discussionId = discussion?.node?.id ? discussion?.node?.id : "";

    if (discussionId === "") {
      throw new Error(`Can not proceed, discussionId is null!`);
    }
    else if (!discussion?.node?.locked) {

      core.debug(`\n Current discussion id: ${discussionId}`);
      core.debug(`Current discussion : ${discussion?.node?.bodyText}`);

      const author = discussion?.node?.author?.login;
      core.debug(`Author of this discussions is: ${author}`);

      if (discussion?.node?.answer?.bodyText) {
        core.debug(`Posted answer : ${discussion?.node?.answer?.bodyText}, No action needed `);
      }
      else {
        core.debug("Processing comments on discussion");
        await processComments(discussion?.node?.comments as DiscussionCommentConnection, author || "", discussionId, githubClient);
      }
    }
    else {
      core.info(`Discussion ${discussionId} is locked, closing it as resolved`)
      githubClient.closeDiscussionAsResolved(discussionId);
    }
  })
}

export async function processComments(comments: DiscussionCommentConnection, author: string, discussionId: string, githubClient: GithubDiscussionClient) {
  comments.edges?.forEach((comment) => {
    if (comment?.node?.bodyText) {
      if (comment.node.id === "") {
        throw new Error("Can not proceed with Null comment Id!");
      }

      // check for the presence of proposed answer keyword
      if ((comment?.node?.bodyText.indexOf(PROPOSED_ANSWER_TEXT) >= 0) && (comment?.node?.reactions.nodes?.length != 0)) {
        //means answer was proposed earlier, check reactions to this comment
        core.debug("Propose answer keyword found at : " + comment?.node?.bodyText.indexOf(PROPOSED_ANSWER_TEXT));

        //if reaction is - heart/thumbs up/hooray, mark comment as answered else mention repo maintainer to take a look
        comment?.node?.reactions.nodes?.forEach((reaction) => {
          core.debug(`Reaction to the latest comment is : ${reaction?.content}`);
          githubClient.triggerReactionContentBasedAction(reaction?.content! as ReactionContent, comment.node?.bodyText!, discussionId, comment.node?.id!, PROPOSED_ANSWER_TEXT);
        })
      }

      else if ((comment?.node?.bodyText.indexOf(PROPOSED_ANSWER_TEXT) >= 0) && (comment?.node?.reactions.nodes?.length == 0)) {
        // if keyword is found but no reaction/comment received by author, remind discussion author to take a look
        const updatedAt = comment?.node?.updatedAt;
        const commentDate = new Date(updatedAt.toString());

        core.debug("No reactions found");
        githubClient.remindAuthorForAction(commentDate, author!, discussionId, STALE_DISCUSSION_REMINDER_RESPONSE);
      }
      else if ((comment?.node?.bodyText.indexOf(STALE_DISCUSSION_REMINDER_RESPONSE) >= 0) && (comment?.node?.reactions.nodes?.length == 0)) {
        const updatedAt = comment?.node?.updatedAt;
        const commentDate = new Date(updatedAt.toString());

        githubClient.closeDiscussionsInAbsenceOfReaction(commentDate, discussionId);
      }
      else {
        core.info("No answer proposed on comment, no action needed ");
      }
    }
  })
}

main();
