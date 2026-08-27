import { FxSvg, type FxSvgProps } from '../FxSvg.js';

/** Hand-written (no eye glyph in the mobile set) — used by FxTextInput's password reveal. */
export const FxEyeIcon = (props: FxSvgProps) => (
  <FxSvg width={24} height={24} viewBox="0 0 24 24" {...props}>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 5C7.5 5 3.7 7.9 2 12c1.7 4.1 5.5 7 10 7s8.3-2.9 10-7c-1.7-4.1-5.5-7-10-7Zm0 12.5c-3.5 0-6.6-2.1-8.4-5.5C5.4 8.6 8.5 6.5 12 6.5s6.6 2.1 8.4 5.5c-1.8 3.4-4.9 5.5-8.4 5.5ZM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm0 5.5a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z"
    />
  </FxSvg>
);

export const FxEyeOffIcon = (props: FxSvgProps) => (
  <FxSvg width={24} height={24} viewBox="0 0 24 24" {...props}>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M3.53 2.47a.75.75 0 0 0-1.06 1.06l3.1 3.1C4.02 7.9 2.8 9.8 2 12c1.7 4.1 5.5 7 10 7 1.7 0 3.3-.4 4.7-1.1l3.8 3.8a.75.75 0 1 0 1.06-1.06l-18-18ZM12 17.5c-3.5 0-6.6-2.1-8.4-5.5.7-1.4 1.7-2.6 2.9-3.5l2.1 2.1a3.5 3.5 0 0 0 4.8 4.8l1.9 1.9c-1 .1-2.1.2-3.3.2Zm0-3.5a2 2 0 0 1-2-2l2 2Zm8.4-2c-.9 1.7-2.1 3.1-3.6 4.1l-1.1-1.1c1.3-.8 2.4-2 3.1-3-1.8-3.4-4.9-5.5-8.8-5.5-.7 0-1.4.1-2.1.2L6.7 5.5C8.3 4.9 10.1 4.5 12 4.5c4.5 0 8.3 2.9 10 7.5l-1.6.5ZM12 8.5c.3 0 .6 0 .9.1l-1.5-1.5c-.6-.1-1.3-.1-1.9 0l1.2 1.2c.4.2.9.2 1.3.2Z"
    />
  </FxSvg>
);
