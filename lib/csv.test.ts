import { describe, it, expect } from "vitest";
import { parseCsv } from "./csv";

describe("parseCsv", () => {
  it("parses headers and rows, lowercasing headers", () => {
    const { headers, rows } = parseCsv("Series,Year\nMorgan Dollar,1889");
    expect(headers).toEqual(["series", "year"]);
    expect(rows).toEqual([{ series: "Morgan Dollar", year: "1889" }]);
  });

  it("tolerates blank cells and trailing/ragged rows", () => {
    const { rows } = parseCsv("a,b,c\n1,,3\n4,5\n\n");
    expect(rows).toEqual([
      { a: "1", b: "", c: "3" },
      { a: "4", b: "5", c: "" }, // missing trailing cell → empty string
    ]);
  });

  it("handles quoted fields with commas and escaped quotes", () => {
    const { rows } = parseCsv(
      'series,note\n"Liberty, Head","a ""nice"" coin"',
    );
    expect(rows[0].series).toBe("Liberty, Head");
    expect(rows[0].note).toBe('a "nice" coin');
  });

  it("handles CRLF line endings and quoted newlines", () => {
    const { rows } = parseCsv('a,b\r\n1,"line1\nline2"\r\n');
    expect(rows).toHaveLength(1);
    expect(rows[0].b).toBe("line1\nline2");
  });

  it("returns empty for blank input", () => {
    expect(parseCsv("   ").rows).toEqual([]);
    expect(parseCsv("").headers).toEqual([]);
  });
});
