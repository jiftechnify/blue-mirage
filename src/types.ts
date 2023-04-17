import type { AppBskyActorDefs } from "@atproto/api";

export type Crendentials = {
  email: string;
  password: string;
};

export type FullActor = AppBskyActorDefs.ProfileViewDetailed;

export type CopyProgress =
  | {
      state: "pending";
    }
  | {
      state: "fetchingFollows";
    }
  | {
      state: "following";
      curr: number;
      max: number;
    }
  | {
      state: "refetchingMyFollows";
    };
