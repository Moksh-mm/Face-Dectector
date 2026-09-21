/** Joins class names, skipping anything falsy. */
export const cx = (...names: Array<string | false | null | undefined>) =>
  names.filter(Boolean).join(" ");
