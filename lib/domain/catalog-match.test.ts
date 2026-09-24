import { describe, it, expect } from "vitest";
import type { CoinType } from "@/lib/catalog";
import { matchCatalogCoin } from "./catalog-match";

const coin = (over: Partial<CoinType>): CoinType => ({
  id: "x",
  slug: "x",
  series: "",
  year: null,
  mintmark: null,
  variety: null,
  metal: null,
  fine_weight_oz: null,
  name: "",
  ...over,
});

const CATALOG: CoinType[] = [
  coin({ id: "morgan-1881-s", series: "Morgan Dollar", year: 1881, mintmark: "S", name: "1881-S Morgan Dollar" }),
  coin({ id: "morgan-1889-cc", series: "Morgan Dollar", year: 1889, mintmark: "CC", name: "1889-CC Morgan Dollar" }),
  coin({ id: "morgan-1921", series: "Morgan Dollar", year: 1921, mintmark: null, name: "1921 Morgan Dollar" }),
  coin({ id: "peace-1921", series: "Peace Dollar", year: 1921, mintmark: null, name: "1921 Peace Dollar" }),
  coin({ id: "mercury-1916-d", series: "Mercury Dime", year: 1916, mintmark: "D", name: "1916-D Mercury Dime" }),
  coin({ id: "lincoln-1909", series: "Lincoln Wheat Cent", year: 1909, mintmark: null, name: "1909 Lincoln Cent" }),
  coin({ id: "lincoln-1909-vdb", series: "Lincoln Wheat Cent", year: 1909, mintmark: null, variety: "VDB", name: "1909 VDB Lincoln Cent" }),
  coin({ id: "lincoln-1943", series: "Lincoln Wheat Cent", year: 1943, mintmark: null, name: "1943 Steel Cent" }),
];

describe("matchCatalogCoin", () => {
  it("matches on year + mintmark when unique", () => {
    expect(matchCatalogCoin("1881-S Morgan Dollar MS65 PCGS", CATALOG)).toBe("morgan-1881-s");
    expect(matchCatalogCoin("1916-D Mercury Dime", CATALOG)).toBe("mercury-1916-d");
  });

  it("parses a CC mintmark", () => {
    expect(matchCatalogCoin("1889-CC Morgan Dollar VF details", CATALOG)).toBe("morgan-1889-cc");
  });

  it("treats a missing mintmark as Philadelphia", () => {
    expect(matchCatalogCoin("1943 Steel Cent", CATALOG)).toBe("lincoln-1943");
  });

  it("disambiguates same year+mint by a distinctive series word", () => {
    expect(matchCatalogCoin("1921 Peace Dollar", CATALOG)).toBe("peace-1921");
    expect(matchCatalogCoin("1921 Morgan Dollar", CATALOG)).toBe("morgan-1921");
  });

  it("returns null when it cannot be sure (ambiguous variety)", () => {
    // Two 1909 Philadelphia Lincolns; "VDB" is too short to distinguish.
    expect(matchCatalogCoin("1909 VDB Lincoln Cent", CATALOG)).toBeNull();
  });

  it("returns null with no year, no catalog match, or an empty catalog", () => {
    expect(matchCatalogCoin("Morgan Dollar", CATALOG)).toBeNull();
    expect(matchCatalogCoin("1799 Draped Bust Dollar", CATALOG)).toBeNull();
    expect(matchCatalogCoin("1881-S Morgan Dollar", [])).toBeNull();
  });

  it("ignores a later cert number and locks onto the leading year", () => {
    expect(matchCatalogCoin("1881-S Morgan Dollar MS65 PCGS 20451234", CATALOG)).toBe("morgan-1881-s");
  });
});
