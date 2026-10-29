import { css } from 'lit';

/** Styles of `<authenticated-image>`. */
export const styles = css`
  :host {
    display: inline-grid;
    /* Lets ::part(img) { height: 100% } resolve against a sized host. */
    grid-template: minmax(0, 1fr) / minmax(0, 1fr);
  }

  img,
  slot {
    grid-area: 1 / 1;
  }

  img {
    display: block;
    max-width: 100%;
    height: auto;
    object-fit: var(--authenticated-image-object-fit, fill);
  }

  /* Keep the box so width and height reserve space before the image loads. */
  img[hidden] {
    visibility: hidden;
  }

  slot {
    display: block;
  }

  slot[hidden] {
    display: none;
  }
`;
