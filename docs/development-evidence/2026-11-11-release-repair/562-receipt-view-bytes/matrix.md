| Actual (expected: the case's page bytes, 11,483 B at offset 0) | Dimension | toEqual | toEqual, arguments swapped | deepStrictEqual | deepStrictEqual, arguments swapped |
|---|---|---|---|---|---|
| same bytes, subview at offset 775 of a larger buffer (the case shape) | none | accepts | accepts | accepts | accepts |
| same bytes, offset 0, own buffer | none | accepts | accepts | accepts | accepts |
| same bytes, offset 0 vs 1 of differently padded buffers | byte offset / underlying buffer | accepts | accepts | accepts | accepts |
| first byte changed | element values | refuses | refuses | refuses | refuses |
| middle byte changed | element values | refuses | refuses | refuses | refuses |
| last byte changed | element values | refuses | refuses | refuses | refuses |
| one byte shorter, same prefix | length | refuses | refuses | refuses | refuses |
| one byte longer, same prefix | length | refuses | refuses | refuses | refuses |
| plain Array of the same values | type | refuses | refuses | refuses | refuses |
| Node Buffer of the same bytes | type | refuses | refuses | refuses | refuses |
| Uint8ClampedArray of the same values | type | refuses | refuses | refuses | refuses |
| Int16Array of the same values | type | refuses | refuses | refuses | refuses |
| subclass of Uint8Array, same bytes | type | refuses | refuses | refuses | refuses |
| ArrayBuffer of the same bytes | type | refuses | refuses | refuses | refuses |
| DataView over the same bytes | type | refuses | refuses | refuses | refuses |
| array-like object {0..n-1, length} | type | refuses | refuses | refuses | refuses |
| same constructor, different prototype object | prototype | accepts | accepts | accepts | accepts |
| extra own enumerable string property | extra own properties | refuses | refuses | refuses | refuses |
| extra own enumerable string property, value undefined | extra own properties | refuses | refuses | refuses | refuses |
| extra own enumerable symbol property | extra own properties | accepts | accepts | refuses | refuses |
| extra own non-enumerable property | extra own properties | accepts | accepts | accepts | accepts |
| undefined | type | refuses | refuses | refuses | refuses |
| Uint16Array of the same values, own non-enumerable constructor = Uint8Array | type | accepts | accepts | refuses | refuses |
| Uint8Array of the same bytes, own non-enumerable constructor = Buffer | type | refuses | refuses | refuses | refuses |
