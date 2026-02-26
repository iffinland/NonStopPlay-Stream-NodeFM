export interface NodeFmUserProfile {
  name?: string;
  address?: string;
  avatarUrl?: string;
}

export interface NodeFmRuntime {
  bootstrap: () => Promise<void>;
  destroy: () => void;
  setUserProfile: (profile: NodeFmUserProfile) => void;
}

export function createNodeFmRuntime(): NodeFmRuntime;
