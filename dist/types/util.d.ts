import { ReactionContent } from "./generated/graphql";
export declare function daysSinceComment(commentDate: Date): number;
export declare function containsPositiveReaction(content: ReactionContent): boolean;
export declare function containsNegativeReaction(content: ReactionContent): boolean;
