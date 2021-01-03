/**
 *
 * LeftMenuFooter
 *
 */

import React from "react";

import Wrapper from "./Wrapper";

function LeftMenuFooter() {
  return (
    <Wrapper>
      <div className="poweredBy">
        <span>Mantido por </span>
        <a
          key="website"
          href="oliveirawesleyrj@gmail.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          Wesley M Oliveira
        </a>
      </div>
    </Wrapper>
  );
}

export default LeftMenuFooter;
