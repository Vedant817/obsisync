var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// ../../packages/protocol/src/version.ts
var PROTOCOL_LIMITS = {
  /** Default page size for the change feed. */
  changesPageSize: 200,
  /** Never ask for more than this in one page regardless of settings. */
  changesPageSizeMax: 500,
  /** Encrypted blob hard ceiling per object (v1 rejects bigger uploads). */
  maxObjectBytes: 25 * 1024 * 1024,
  /** Default per-file attachment limit configurable in settings. */
  defaultAttachmentMaxBytes: 4 * 1024 * 1024,
  /** Upload session lifetime. */
  uploadSessionTtlMs: 15 * 60 * 1e3,
  /** One-time pairing invitation lifetime. */
  invitationTtlMs: 10 * 60 * 1e3,
  /** Staging objects older than this are GC-eligible. */
  stagingGcAfterMs: 24 * 60 * 60 * 1e3,
  /** Begin refusing history commits when live estimate passes this. */
  maxVaultStorageEstimateBytes: 9 * 1024 * 1024 * 1024
};

// ../../node_modules/zod/v3/external.js
var external_exports = {};
__export(external_exports, {
  BRAND: () => BRAND,
  DIRTY: () => DIRTY,
  EMPTY_PATH: () => EMPTY_PATH,
  INVALID: () => INVALID,
  NEVER: () => NEVER,
  OK: () => OK,
  ParseStatus: () => ParseStatus,
  Schema: () => ZodType,
  ZodAny: () => ZodAny,
  ZodArray: () => ZodArray,
  ZodBigInt: () => ZodBigInt,
  ZodBoolean: () => ZodBoolean,
  ZodBranded: () => ZodBranded,
  ZodCatch: () => ZodCatch,
  ZodDate: () => ZodDate,
  ZodDefault: () => ZodDefault,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodEffects: () => ZodEffects,
  ZodEnum: () => ZodEnum,
  ZodError: () => ZodError,
  ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind,
  ZodFunction: () => ZodFunction,
  ZodIntersection: () => ZodIntersection,
  ZodIssueCode: () => ZodIssueCode,
  ZodLazy: () => ZodLazy,
  ZodLiteral: () => ZodLiteral,
  ZodMap: () => ZodMap,
  ZodNaN: () => ZodNaN,
  ZodNativeEnum: () => ZodNativeEnum,
  ZodNever: () => ZodNever,
  ZodNull: () => ZodNull,
  ZodNullable: () => ZodNullable,
  ZodNumber: () => ZodNumber,
  ZodObject: () => ZodObject,
  ZodOptional: () => ZodOptional,
  ZodParsedType: () => ZodParsedType,
  ZodPipeline: () => ZodPipeline,
  ZodPromise: () => ZodPromise,
  ZodReadonly: () => ZodReadonly,
  ZodRecord: () => ZodRecord,
  ZodSchema: () => ZodType,
  ZodSet: () => ZodSet,
  ZodString: () => ZodString,
  ZodSymbol: () => ZodSymbol,
  ZodTransformer: () => ZodEffects,
  ZodTuple: () => ZodTuple,
  ZodType: () => ZodType,
  ZodUndefined: () => ZodUndefined,
  ZodUnion: () => ZodUnion,
  ZodUnknown: () => ZodUnknown,
  ZodVoid: () => ZodVoid,
  addIssueToContext: () => addIssueToContext,
  any: () => anyType,
  array: () => arrayType,
  bigint: () => bigIntType,
  boolean: () => booleanType,
  coerce: () => coerce,
  custom: () => custom,
  date: () => dateType,
  datetimeRegex: () => datetimeRegex,
  defaultErrorMap: () => en_default,
  discriminatedUnion: () => discriminatedUnionType,
  effect: () => effectsType,
  enum: () => enumType,
  function: () => functionType,
  getErrorMap: () => getErrorMap,
  getParsedType: () => getParsedType,
  instanceof: () => instanceOfType,
  intersection: () => intersectionType,
  isAborted: () => isAborted,
  isAsync: () => isAsync,
  isDirty: () => isDirty,
  isValid: () => isValid,
  late: () => late,
  lazy: () => lazyType,
  literal: () => literalType,
  makeIssue: () => makeIssue,
  map: () => mapType,
  nan: () => nanType,
  nativeEnum: () => nativeEnumType,
  never: () => neverType,
  null: () => nullType,
  nullable: () => nullableType,
  number: () => numberType,
  object: () => objectType,
  objectUtil: () => objectUtil,
  oboolean: () => oboolean,
  onumber: () => onumber,
  optional: () => optionalType,
  ostring: () => ostring,
  pipeline: () => pipelineType,
  preprocess: () => preprocessType,
  promise: () => promiseType,
  quotelessJson: () => quotelessJson,
  record: () => recordType,
  set: () => setType,
  setErrorMap: () => setErrorMap,
  strictObject: () => strictObjectType,
  string: () => stringType,
  symbol: () => symbolType,
  transformer: () => effectsType,
  tuple: () => tupleType,
  undefined: () => undefinedType,
  union: () => unionType,
  unknown: () => unknownType,
  util: () => util,
  void: () => voidType
});

// ../../node_modules/zod/v3/helpers/util.js
var util;
(function(util2) {
  util2.assertEqual = (_) => {
  };
  function assertIs(_arg) {
  }
  util2.assertIs = assertIs;
  function assertNever(_x) {
    throw new Error();
  }
  util2.assertNever = assertNever;
  util2.arrayToEnum = (items) => {
    const obj = {};
    for (const item of items) {
      obj[item] = item;
    }
    return obj;
  };
  util2.getValidEnumValues = (obj) => {
    const validKeys = util2.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
    const filtered = {};
    for (const k of validKeys) {
      filtered[k] = obj[k];
    }
    return util2.objectValues(filtered);
  };
  util2.objectValues = (obj) => {
    return util2.objectKeys(obj).map(function(e) {
      return obj[e];
    });
  };
  util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
    const keys = [];
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        keys.push(key);
      }
    }
    return keys;
  };
  util2.find = (arr, checker) => {
    for (const item of arr) {
      if (checker(item))
        return item;
    }
    return void 0;
  };
  util2.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
  function joinValues(array, separator = " | ") {
    return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
  }
  util2.joinValues = joinValues;
  util2.jsonStringifyReplacer = (_, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  };
})(util || (util = {}));
var objectUtil;
(function(objectUtil2) {
  objectUtil2.mergeShapes = (first, second) => {
    return {
      ...first,
      ...second
      // second overwrites first
    };
  };
})(objectUtil || (objectUtil = {}));
var ZodParsedType = util.arrayToEnum([
  "string",
  "nan",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "bigint",
  "symbol",
  "function",
  "undefined",
  "null",
  "array",
  "object",
  "unknown",
  "promise",
  "void",
  "never",
  "map",
  "set"
]);
var getParsedType = (data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return ZodParsedType.undefined;
    case "string":
      return ZodParsedType.string;
    case "number":
      return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
    case "boolean":
      return ZodParsedType.boolean;
    case "function":
      return ZodParsedType.function;
    case "bigint":
      return ZodParsedType.bigint;
    case "symbol":
      return ZodParsedType.symbol;
    case "object":
      if (Array.isArray(data)) {
        return ZodParsedType.array;
      }
      if (data === null) {
        return ZodParsedType.null;
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return ZodParsedType.promise;
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return ZodParsedType.map;
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return ZodParsedType.set;
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return ZodParsedType.date;
      }
      return ZodParsedType.object;
    default:
      return ZodParsedType.unknown;
  }
};

// ../../node_modules/zod/v3/ZodError.js
var ZodIssueCode = util.arrayToEnum([
  "invalid_type",
  "invalid_literal",
  "custom",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "unrecognized_keys",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite"
]);
var quotelessJson = (obj) => {
  const json2 = JSON.stringify(obj, null, 2);
  return json2.replace(/"([^"]+)":/g, "$1:");
};
var ZodError = class _ZodError extends Error {
  get errors() {
    return this.issues;
  }
  constructor(issues) {
    super();
    this.issues = [];
    this.addIssue = (sub) => {
      this.issues = [...this.issues, sub];
    };
    this.addIssues = (subs = []) => {
      this.issues = [...this.issues, ...subs];
    };
    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    } else {
      this.__proto__ = actualProto;
    }
    this.name = "ZodError";
    this.issues = issues;
  }
  format(_mapper) {
    const mapper = _mapper || function(issue) {
      return issue.message;
    };
    const fieldErrors = { _errors: [] };
    const processError = (error) => {
      for (const issue of error.issues) {
        if (issue.code === "invalid_union") {
          issue.unionErrors.map(processError);
        } else if (issue.code === "invalid_return_type") {
          processError(issue.returnTypeError);
        } else if (issue.code === "invalid_arguments") {
          processError(issue.argumentsError);
        } else if (issue.path.length === 0) {
          fieldErrors._errors.push(mapper(issue));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < issue.path.length) {
            const el = issue.path[i];
            const terminal = i === issue.path.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue));
            }
            curr = curr[el];
            i++;
          }
        }
      }
    };
    processError(this);
    return fieldErrors;
  }
  static assert(value) {
    if (!(value instanceof _ZodError)) {
      throw new Error(`Not a ZodError: ${value}`);
    }
  }
  toString() {
    return this.message;
  }
  get message() {
    return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
  }
  get isEmpty() {
    return this.issues.length === 0;
  }
  flatten(mapper = (issue) => issue.message) {
    const fieldErrors = {};
    const formErrors = [];
    for (const sub of this.issues) {
      if (sub.path.length > 0) {
        const firstEl = sub.path[0];
        fieldErrors[firstEl] = fieldErrors[firstEl] || [];
        fieldErrors[firstEl].push(mapper(sub));
      } else {
        formErrors.push(mapper(sub));
      }
    }
    return { formErrors, fieldErrors };
  }
  get formErrors() {
    return this.flatten();
  }
};
ZodError.create = (issues) => {
  const error = new ZodError(issues);
  return error;
};

// ../../node_modules/zod/v3/locales/en.js
var errorMap = (issue, _ctx) => {
  let message;
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === ZodParsedType.undefined) {
        message = "Required";
      } else {
        message = `Expected ${issue.expected}, received ${issue.received}`;
      }
      break;
    case ZodIssueCode.invalid_literal:
      message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
      break;
    case ZodIssueCode.unrecognized_keys:
      message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
      break;
    case ZodIssueCode.invalid_union:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_union_discriminator:
      message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
      break;
    case ZodIssueCode.invalid_enum_value:
      message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
      break;
    case ZodIssueCode.invalid_arguments:
      message = `Invalid function arguments`;
      break;
    case ZodIssueCode.invalid_return_type:
      message = `Invalid function return type`;
      break;
    case ZodIssueCode.invalid_date:
      message = `Invalid date`;
      break;
    case ZodIssueCode.invalid_string:
      if (typeof issue.validation === "object") {
        if ("includes" in issue.validation) {
          message = `Invalid input: must include "${issue.validation.includes}"`;
          if (typeof issue.validation.position === "number") {
            message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
          }
        } else if ("startsWith" in issue.validation) {
          message = `Invalid input: must start with "${issue.validation.startsWith}"`;
        } else if ("endsWith" in issue.validation) {
          message = `Invalid input: must end with "${issue.validation.endsWith}"`;
        } else {
          util.assertNever(issue.validation);
        }
      } else if (issue.validation !== "regex") {
        message = `Invalid ${issue.validation}`;
      } else {
        message = "Invalid";
      }
      break;
    case ZodIssueCode.too_small:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "bigint")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.too_big:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "bigint")
        message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.custom:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_intersection_types:
      message = `Intersection results could not be merged`;
      break;
    case ZodIssueCode.not_multiple_of:
      message = `Number must be a multiple of ${issue.multipleOf}`;
      break;
    case ZodIssueCode.not_finite:
      message = "Number must be finite";
      break;
    default:
      message = _ctx.defaultError;
      util.assertNever(issue);
  }
  return { message };
};
var en_default = errorMap;

// ../../node_modules/zod/v3/errors.js
var overrideErrorMap = en_default;
function setErrorMap(map) {
  overrideErrorMap = map;
}
function getErrorMap() {
  return overrideErrorMap;
}

// ../../node_modules/zod/v3/helpers/parseUtil.js
var makeIssue = (params) => {
  const { data, path, errorMaps, issueData } = params;
  const fullPath = [...path, ...issueData.path || []];
  const fullIssue = {
    ...issueData,
    path: fullPath
  };
  if (issueData.message !== void 0) {
    return {
      ...issueData,
      path: fullPath,
      message: issueData.message
    };
  }
  let errorMessage = "";
  const maps = errorMaps.filter((m) => !!m).slice().reverse();
  for (const map of maps) {
    errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
  }
  return {
    ...issueData,
    path: fullPath,
    message: errorMessage
  };
};
var EMPTY_PATH = [];
function addIssueToContext(ctx, issueData) {
  const overrideMap = getErrorMap();
  const issue = makeIssue({
    issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap,
      // contextual error map is first priority
      ctx.schemaErrorMap,
      // then schema-bound map if available
      overrideMap,
      // then global override map
      overrideMap === en_default ? void 0 : en_default
      // then global default map
    ].filter((x) => !!x)
  });
  ctx.common.issues.push(issue);
}
var ParseStatus = class _ParseStatus {
  constructor() {
    this.value = "valid";
  }
  dirty() {
    if (this.value === "valid")
      this.value = "dirty";
  }
  abort() {
    if (this.value !== "aborted")
      this.value = "aborted";
  }
  static mergeArray(status, results) {
    const arrayValue = [];
    for (const s of results) {
      if (s.status === "aborted")
        return INVALID;
      if (s.status === "dirty")
        status.dirty();
      arrayValue.push(s.value);
    }
    return { status: status.value, value: arrayValue };
  }
  static async mergeObjectAsync(status, pairs) {
    const syncPairs = [];
    for (const pair of pairs) {
      const key = await pair.key;
      const value = await pair.value;
      syncPairs.push({
        key,
        value
      });
    }
    return _ParseStatus.mergeObjectSync(status, syncPairs);
  }
  static mergeObjectSync(status, pairs) {
    const finalObject = {};
    for (const pair of pairs) {
      const { key, value } = pair;
      if (key.status === "aborted")
        return INVALID;
      if (value.status === "aborted")
        return INVALID;
      if (key.status === "dirty")
        status.dirty();
      if (value.status === "dirty")
        status.dirty();
      if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
        finalObject[key.value] = value.value;
      }
    }
    return { status: status.value, value: finalObject };
  }
};
var INVALID = Object.freeze({
  status: "aborted"
});
var DIRTY = (value) => ({ status: "dirty", value });
var OK = (value) => ({ status: "valid", value });
var isAborted = (x) => x.status === "aborted";
var isDirty = (x) => x.status === "dirty";
var isValid = (x) => x.status === "valid";
var isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;

// ../../node_modules/zod/v3/helpers/errorUtil.js
var errorUtil;
(function(errorUtil2) {
  errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
  errorUtil2.toString = (message) => typeof message === "string" ? message : message?.message;
})(errorUtil || (errorUtil = {}));

// ../../node_modules/zod/v3/types.js
var ParseInputLazyPath = class {
  constructor(parent, value, path, key) {
    this._cachedPath = [];
    this.parent = parent;
    this.data = value;
    this._path = path;
    this._key = key;
  }
  get path() {
    if (!this._cachedPath.length) {
      if (Array.isArray(this._key)) {
        this._cachedPath.push(...this._path, ...this._key);
      } else {
        this._cachedPath.push(...this._path, this._key);
      }
    }
    return this._cachedPath;
  }
};
var handleResult = (ctx, result) => {
  if (isValid(result)) {
    return { success: true, data: result.value };
  } else {
    if (!ctx.common.issues.length) {
      throw new Error("Validation failed but no issues detected.");
    }
    return {
      success: false,
      get error() {
        if (this._error)
          return this._error;
        const error = new ZodError(ctx.common.issues);
        this._error = error;
        return this._error;
      }
    };
  }
};
function processCreateParams(params) {
  if (!params)
    return {};
  const { errorMap: errorMap2, invalid_type_error, required_error, description } = params;
  if (errorMap2 && (invalid_type_error || required_error)) {
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  }
  if (errorMap2)
    return { errorMap: errorMap2, description };
  const customMap = (iss, ctx) => {
    const { message } = params;
    if (iss.code === "invalid_enum_value") {
      return { message: message ?? ctx.defaultError };
    }
    if (typeof ctx.data === "undefined") {
      return { message: message ?? required_error ?? ctx.defaultError };
    }
    if (iss.code !== "invalid_type")
      return { message: ctx.defaultError };
    return { message: message ?? invalid_type_error ?? ctx.defaultError };
  };
  return { errorMap: customMap, description };
}
var ZodType = class {
  get description() {
    return this._def.description;
  }
  _getType(input) {
    return getParsedType(input.data);
  }
  _getOrReturnCtx(input, ctx) {
    return ctx || {
      common: input.parent.common,
      data: input.data,
      parsedType: getParsedType(input.data),
      schemaErrorMap: this._def.errorMap,
      path: input.path,
      parent: input.parent
    };
  }
  _processInputParams(input) {
    return {
      status: new ParseStatus(),
      ctx: {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent
      }
    };
  }
  _parseSync(input) {
    const result = this._parse(input);
    if (isAsync(result)) {
      throw new Error("Synchronous parse encountered promise.");
    }
    return result;
  }
  _parseAsync(input) {
    const result = this._parse(input);
    return Promise.resolve(result);
  }
  parse(data, params) {
    const result = this.safeParse(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  safeParse(data, params) {
    const ctx = {
      common: {
        issues: [],
        async: params?.async ?? false,
        contextualErrorMap: params?.errorMap
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const result = this._parseSync({ data, path: ctx.path, parent: ctx });
    return handleResult(ctx, result);
  }
  "~validate"(data) {
    const ctx = {
      common: {
        issues: [],
        async: !!this["~standard"].async
      },
      path: [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    if (!this["~standard"].async) {
      try {
        const result = this._parseSync({ data, path: [], parent: ctx });
        return isValid(result) ? {
          value: result.value
        } : {
          issues: ctx.common.issues
        };
      } catch (err) {
        if (err?.message?.toLowerCase()?.includes("encountered")) {
          this["~standard"].async = true;
        }
        ctx.common = {
          issues: [],
          async: true
        };
      }
    }
    return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid(result) ? {
      value: result.value
    } : {
      issues: ctx.common.issues
    });
  }
  async parseAsync(data, params) {
    const result = await this.safeParseAsync(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  async safeParseAsync(data, params) {
    const ctx = {
      common: {
        issues: [],
        contextualErrorMap: params?.errorMap,
        async: true
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
    const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
    return handleResult(ctx, result);
  }
  refine(check, message) {
    const getIssueProperties = (val) => {
      if (typeof message === "string" || typeof message === "undefined") {
        return { message };
      } else if (typeof message === "function") {
        return message(val);
      } else {
        return message;
      }
    };
    return this._refinement((val, ctx) => {
      const result = check(val);
      const setError = () => ctx.addIssue({
        code: ZodIssueCode.custom,
        ...getIssueProperties(val)
      });
      if (typeof Promise !== "undefined" && result instanceof Promise) {
        return result.then((data) => {
          if (!data) {
            setError();
            return false;
          } else {
            return true;
          }
        });
      }
      if (!result) {
        setError();
        return false;
      } else {
        return true;
      }
    });
  }
  refinement(check, refinementData) {
    return this._refinement((val, ctx) => {
      if (!check(val)) {
        ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
        return false;
      } else {
        return true;
      }
    });
  }
  _refinement(refinement) {
    return new ZodEffects({
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "refinement", refinement }
    });
  }
  superRefine(refinement) {
    return this._refinement(refinement);
  }
  constructor(def) {
    this.spa = this.safeParseAsync;
    this._def = def;
    this.parse = this.parse.bind(this);
    this.safeParse = this.safeParse.bind(this);
    this.parseAsync = this.parseAsync.bind(this);
    this.safeParseAsync = this.safeParseAsync.bind(this);
    this.spa = this.spa.bind(this);
    this.refine = this.refine.bind(this);
    this.refinement = this.refinement.bind(this);
    this.superRefine = this.superRefine.bind(this);
    this.optional = this.optional.bind(this);
    this.nullable = this.nullable.bind(this);
    this.nullish = this.nullish.bind(this);
    this.array = this.array.bind(this);
    this.promise = this.promise.bind(this);
    this.or = this.or.bind(this);
    this.and = this.and.bind(this);
    this.transform = this.transform.bind(this);
    this.brand = this.brand.bind(this);
    this.default = this.default.bind(this);
    this.catch = this.catch.bind(this);
    this.describe = this.describe.bind(this);
    this.pipe = this.pipe.bind(this);
    this.readonly = this.readonly.bind(this);
    this.isNullable = this.isNullable.bind(this);
    this.isOptional = this.isOptional.bind(this);
    this["~standard"] = {
      version: 1,
      vendor: "zod",
      validate: (data) => this["~validate"](data)
    };
  }
  optional() {
    return ZodOptional.create(this, this._def);
  }
  nullable() {
    return ZodNullable.create(this, this._def);
  }
  nullish() {
    return this.nullable().optional();
  }
  array() {
    return ZodArray.create(this);
  }
  promise() {
    return ZodPromise.create(this, this._def);
  }
  or(option) {
    return ZodUnion.create([this, option], this._def);
  }
  and(incoming) {
    return ZodIntersection.create(this, incoming, this._def);
  }
  transform(transform) {
    return new ZodEffects({
      ...processCreateParams(this._def),
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "transform", transform }
    });
  }
  default(def) {
    const defaultValueFunc = typeof def === "function" ? def : () => def;
    return new ZodDefault({
      ...processCreateParams(this._def),
      innerType: this,
      defaultValue: defaultValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodDefault
    });
  }
  brand() {
    return new ZodBranded({
      typeName: ZodFirstPartyTypeKind.ZodBranded,
      type: this,
      ...processCreateParams(this._def)
    });
  }
  catch(def) {
    const catchValueFunc = typeof def === "function" ? def : () => def;
    return new ZodCatch({
      ...processCreateParams(this._def),
      innerType: this,
      catchValue: catchValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodCatch
    });
  }
  describe(description) {
    const This = this.constructor;
    return new This({
      ...this._def,
      description
    });
  }
  pipe(target) {
    return ZodPipeline.create(this, target);
  }
  readonly() {
    return ZodReadonly.create(this);
  }
  isOptional() {
    return this.safeParse(void 0).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
};
var cuidRegex = /^c[^\s-]{8,}$/i;
var cuid2Regex = /^[0-9a-z]+$/;
var ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
var uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
var nanoidRegex = /^[a-z0-9_-]{21}$/i;
var jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
var durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
var emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
var _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
var emojiRegex;
var ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
var ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
var ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
var base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
var dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
var dateRegex = new RegExp(`^${dateRegexSource}$`);
function timeRegexSource(args) {
  let secondsRegexSource = `[0-5]\\d`;
  if (args.precision) {
    secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
  } else if (args.precision == null) {
    secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
  }
  const secondsQuantifier = args.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
function timeRegex(args) {
  return new RegExp(`^${timeRegexSource(args)}$`);
}
function datetimeRegex(args) {
  let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
  const opts = [];
  opts.push(args.local ? `Z?` : `Z`);
  if (args.offset)
    opts.push(`([+-]\\d{2}:?\\d{2})`);
  regex = `${regex}(${opts.join("|")})`;
  return new RegExp(`^${regex}$`);
}
function isValidIP(ip, version) {
  if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
    return true;
  }
  return false;
}
function isValidJWT(jwt, alg) {
  if (!jwtRegex.test(jwt))
    return false;
  try {
    const [header] = jwt.split(".");
    if (!header)
      return false;
    const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
    const decoded = JSON.parse(atob(base64));
    if (typeof decoded !== "object" || decoded === null)
      return false;
    if ("typ" in decoded && decoded?.typ !== "JWT")
      return false;
    if (!decoded.alg)
      return false;
    if (alg && decoded.alg !== alg)
      return false;
    return true;
  } catch {
    return false;
  }
}
function isValidCidr(ip, version) {
  if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) {
    return true;
  }
  return false;
}
var ZodString = class _ZodString extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = String(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.string) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.string,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.length < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.length > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "length") {
        const tooBig = input.data.length > check.value;
        const tooSmall = input.data.length < check.value;
        if (tooBig || tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          if (tooBig) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          } else if (tooSmall) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          }
          status.dirty();
        }
      } else if (check.kind === "email") {
        if (!emailRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "email",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "emoji") {
        if (!emojiRegex) {
          emojiRegex = new RegExp(_emojiRegex, "u");
        }
        if (!emojiRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "emoji",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "uuid") {
        if (!uuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "uuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "nanoid") {
        if (!nanoidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "nanoid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid") {
        if (!cuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid2") {
        if (!cuid2Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid2",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ulid") {
        if (!ulidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ulid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "url") {
        try {
          new URL(input.data);
        } catch {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "regex") {
        check.regex.lastIndex = 0;
        const testResult = check.regex.test(input.data);
        if (!testResult) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "regex",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "trim") {
        input.data = input.data.trim();
      } else if (check.kind === "includes") {
        if (!input.data.includes(check.value, check.position)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { includes: check.value, position: check.position },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "toLowerCase") {
        input.data = input.data.toLowerCase();
      } else if (check.kind === "toUpperCase") {
        input.data = input.data.toUpperCase();
      } else if (check.kind === "startsWith") {
        if (!input.data.startsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { startsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "endsWith") {
        if (!input.data.endsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { endsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "datetime") {
        const regex = datetimeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "datetime",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "date") {
        const regex = dateRegex;
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "date",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "time") {
        const regex = timeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "time",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "duration") {
        if (!durationRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "duration",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ip") {
        if (!isValidIP(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ip",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "jwt") {
        if (!isValidJWT(input.data, check.alg)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "jwt",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cidr") {
        if (!isValidCidr(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cidr",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64") {
        if (!base64Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64url") {
        if (!base64urlRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _regex(regex, validation, message) {
    return this.refinement((data) => regex.test(data), {
      validation,
      code: ZodIssueCode.invalid_string,
      ...errorUtil.errToObj(message)
    });
  }
  _addCheck(check) {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  email(message) {
    return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
  }
  url(message) {
    return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
  }
  emoji(message) {
    return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
  }
  uuid(message) {
    return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
  }
  nanoid(message) {
    return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
  }
  cuid(message) {
    return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
  }
  cuid2(message) {
    return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
  }
  ulid(message) {
    return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
  }
  base64(message) {
    return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
  }
  base64url(message) {
    return this._addCheck({
      kind: "base64url",
      ...errorUtil.errToObj(message)
    });
  }
  jwt(options) {
    return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
  }
  ip(options) {
    return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
  }
  cidr(options) {
    return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
  }
  datetime(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "datetime",
        precision: null,
        offset: false,
        local: false,
        message: options
      });
    }
    return this._addCheck({
      kind: "datetime",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      offset: options?.offset ?? false,
      local: options?.local ?? false,
      ...errorUtil.errToObj(options?.message)
    });
  }
  date(message) {
    return this._addCheck({ kind: "date", message });
  }
  time(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "time",
        precision: null,
        message: options
      });
    }
    return this._addCheck({
      kind: "time",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      ...errorUtil.errToObj(options?.message)
    });
  }
  duration(message) {
    return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
  }
  regex(regex, message) {
    return this._addCheck({
      kind: "regex",
      regex,
      ...errorUtil.errToObj(message)
    });
  }
  includes(value, options) {
    return this._addCheck({
      kind: "includes",
      value,
      position: options?.position,
      ...errorUtil.errToObj(options?.message)
    });
  }
  startsWith(value, message) {
    return this._addCheck({
      kind: "startsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  endsWith(value, message) {
    return this._addCheck({
      kind: "endsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  min(minLength, message) {
    return this._addCheck({
      kind: "min",
      value: minLength,
      ...errorUtil.errToObj(message)
    });
  }
  max(maxLength, message) {
    return this._addCheck({
      kind: "max",
      value: maxLength,
      ...errorUtil.errToObj(message)
    });
  }
  length(len, message) {
    return this._addCheck({
      kind: "length",
      value: len,
      ...errorUtil.errToObj(message)
    });
  }
  /**
   * Equivalent to `.min(1)`
   */
  nonempty(message) {
    return this.min(1, errorUtil.errToObj(message));
  }
  trim() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }]
    });
  }
  toLowerCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }]
    });
  }
  toUpperCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toUpperCase" }]
    });
  }
  get isDatetime() {
    return !!this._def.checks.find((ch) => ch.kind === "datetime");
  }
  get isDate() {
    return !!this._def.checks.find((ch) => ch.kind === "date");
  }
  get isTime() {
    return !!this._def.checks.find((ch) => ch.kind === "time");
  }
  get isDuration() {
    return !!this._def.checks.find((ch) => ch.kind === "duration");
  }
  get isEmail() {
    return !!this._def.checks.find((ch) => ch.kind === "email");
  }
  get isURL() {
    return !!this._def.checks.find((ch) => ch.kind === "url");
  }
  get isEmoji() {
    return !!this._def.checks.find((ch) => ch.kind === "emoji");
  }
  get isUUID() {
    return !!this._def.checks.find((ch) => ch.kind === "uuid");
  }
  get isNANOID() {
    return !!this._def.checks.find((ch) => ch.kind === "nanoid");
  }
  get isCUID() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid");
  }
  get isCUID2() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid2");
  }
  get isULID() {
    return !!this._def.checks.find((ch) => ch.kind === "ulid");
  }
  get isIP() {
    return !!this._def.checks.find((ch) => ch.kind === "ip");
  }
  get isCIDR() {
    return !!this._def.checks.find((ch) => ch.kind === "cidr");
  }
  get isBase64() {
    return !!this._def.checks.find((ch) => ch.kind === "base64");
  }
  get isBase64url() {
    return !!this._def.checks.find((ch) => ch.kind === "base64url");
  }
  get minLength() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxLength() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodString.create = (params) => {
  return new ZodString({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodString,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
function floatSafeRemainder(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / 10 ** decCount;
}
var ZodNumber = class _ZodNumber extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
    this.step = this.multipleOf;
  }
  _parse(input) {
    if (this._def.coerce) {
      input.data = Number(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.number) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.number,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "int") {
        if (!util.isInteger(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: "integer",
            received: "float",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (floatSafeRemainder(input.data, check.value) !== 0) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "finite") {
        if (!Number.isFinite(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_finite,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodNumber({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodNumber({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  int(message) {
    return this._addCheck({
      kind: "int",
      message: errorUtil.toString(message)
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  finite(message) {
    return this._addCheck({
      kind: "finite",
      message: errorUtil.toString(message)
    });
  }
  safe(message) {
    return this._addCheck({
      kind: "min",
      inclusive: true,
      value: Number.MIN_SAFE_INTEGER,
      message: errorUtil.toString(message)
    })._addCheck({
      kind: "max",
      inclusive: true,
      value: Number.MAX_SAFE_INTEGER,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
  get isInt() {
    return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
  }
  get isFinite() {
    let max = null;
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
        return true;
      } else if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      } else if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return Number.isFinite(min) && Number.isFinite(max);
  }
};
ZodNumber.create = (params) => {
  return new ZodNumber({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodNumber,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodBigInt = class _ZodBigInt extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
  }
  _parse(input) {
    if (this._def.coerce) {
      try {
        input.data = BigInt(input.data);
      } catch {
        return this._getInvalidInput(input);
      }
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.bigint) {
      return this._getInvalidInput(input);
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            type: "bigint",
            minimum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            type: "bigint",
            maximum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (input.data % check.value !== BigInt(0)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _getInvalidInput(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.bigint,
      received: ctx.parsedType
    });
    return INVALID;
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodBigInt({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodBigInt({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodBigInt.create = (params) => {
  return new ZodBigInt({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodBigInt,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
var ZodBoolean = class extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = Boolean(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.boolean) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.boolean,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodBoolean.create = (params) => {
  return new ZodBoolean({
    typeName: ZodFirstPartyTypeKind.ZodBoolean,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodDate = class _ZodDate extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = new Date(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.date) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.date,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    if (Number.isNaN(input.data.getTime())) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_date
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.getTime() < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            message: check.message,
            inclusive: true,
            exact: false,
            minimum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.getTime() > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            message: check.message,
            inclusive: true,
            exact: false,
            maximum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return {
      status: status.value,
      value: new Date(input.data.getTime())
    };
  }
  _addCheck(check) {
    return new _ZodDate({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  min(minDate, message) {
    return this._addCheck({
      kind: "min",
      value: minDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  max(maxDate, message) {
    return this._addCheck({
      kind: "max",
      value: maxDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  get minDate() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min != null ? new Date(min) : null;
  }
  get maxDate() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max != null ? new Date(max) : null;
  }
};
ZodDate.create = (params) => {
  return new ZodDate({
    checks: [],
    coerce: params?.coerce || false,
    typeName: ZodFirstPartyTypeKind.ZodDate,
    ...processCreateParams(params)
  });
};
var ZodSymbol = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.symbol) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.symbol,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodSymbol.create = (params) => {
  return new ZodSymbol({
    typeName: ZodFirstPartyTypeKind.ZodSymbol,
    ...processCreateParams(params)
  });
};
var ZodUndefined = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.undefined,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodUndefined.create = (params) => {
  return new ZodUndefined({
    typeName: ZodFirstPartyTypeKind.ZodUndefined,
    ...processCreateParams(params)
  });
};
var ZodNull = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.null) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.null,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodNull.create = (params) => {
  return new ZodNull({
    typeName: ZodFirstPartyTypeKind.ZodNull,
    ...processCreateParams(params)
  });
};
var ZodAny = class extends ZodType {
  constructor() {
    super(...arguments);
    this._any = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodAny.create = (params) => {
  return new ZodAny({
    typeName: ZodFirstPartyTypeKind.ZodAny,
    ...processCreateParams(params)
  });
};
var ZodUnknown = class extends ZodType {
  constructor() {
    super(...arguments);
    this._unknown = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodUnknown.create = (params) => {
  return new ZodUnknown({
    typeName: ZodFirstPartyTypeKind.ZodUnknown,
    ...processCreateParams(params)
  });
};
var ZodNever = class extends ZodType {
  _parse(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.never,
      received: ctx.parsedType
    });
    return INVALID;
  }
};
ZodNever.create = (params) => {
  return new ZodNever({
    typeName: ZodFirstPartyTypeKind.ZodNever,
    ...processCreateParams(params)
  });
};
var ZodVoid = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.void,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodVoid.create = (params) => {
  return new ZodVoid({
    typeName: ZodFirstPartyTypeKind.ZodVoid,
    ...processCreateParams(params)
  });
};
var ZodArray = class _ZodArray extends ZodType {
  _parse(input) {
    const { ctx, status } = this._processInputParams(input);
    const def = this._def;
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (def.exactLength !== null) {
      const tooBig = ctx.data.length > def.exactLength.value;
      const tooSmall = ctx.data.length < def.exactLength.value;
      if (tooBig || tooSmall) {
        addIssueToContext(ctx, {
          code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
          minimum: tooSmall ? def.exactLength.value : void 0,
          maximum: tooBig ? def.exactLength.value : void 0,
          type: "array",
          inclusive: true,
          exact: true,
          message: def.exactLength.message
        });
        status.dirty();
      }
    }
    if (def.minLength !== null) {
      if (ctx.data.length < def.minLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.minLength.message
        });
        status.dirty();
      }
    }
    if (def.maxLength !== null) {
      if (ctx.data.length > def.maxLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.maxLength.message
        });
        status.dirty();
      }
    }
    if (ctx.common.async) {
      return Promise.all([...ctx.data].map((item, i) => {
        return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
      })).then((result2) => {
        return ParseStatus.mergeArray(status, result2);
      });
    }
    const result = [...ctx.data].map((item, i) => {
      return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
    });
    return ParseStatus.mergeArray(status, result);
  }
  get element() {
    return this._def.type;
  }
  min(minLength, message) {
    return new _ZodArray({
      ...this._def,
      minLength: { value: minLength, message: errorUtil.toString(message) }
    });
  }
  max(maxLength, message) {
    return new _ZodArray({
      ...this._def,
      maxLength: { value: maxLength, message: errorUtil.toString(message) }
    });
  }
  length(len, message) {
    return new _ZodArray({
      ...this._def,
      exactLength: { value: len, message: errorUtil.toString(message) }
    });
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodArray.create = (schema, params) => {
  return new ZodArray({
    type: schema,
    minLength: null,
    maxLength: null,
    exactLength: null,
    typeName: ZodFirstPartyTypeKind.ZodArray,
    ...processCreateParams(params)
  });
};
function deepPartialify(schema) {
  if (schema instanceof ZodObject) {
    const newShape = {};
    for (const key in schema.shape) {
      const fieldSchema = schema.shape[key];
      newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
    }
    return new ZodObject({
      ...schema._def,
      shape: () => newShape
    });
  } else if (schema instanceof ZodArray) {
    return new ZodArray({
      ...schema._def,
      type: deepPartialify(schema.element)
    });
  } else if (schema instanceof ZodOptional) {
    return ZodOptional.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodNullable) {
    return ZodNullable.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodTuple) {
    return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
  } else {
    return schema;
  }
}
var ZodObject = class _ZodObject extends ZodType {
  constructor() {
    super(...arguments);
    this._cached = null;
    this.nonstrict = this.passthrough;
    this.augment = this.extend;
  }
  _getCached() {
    if (this._cached !== null)
      return this._cached;
    const shape = this._def.shape();
    const keys = util.objectKeys(shape);
    this._cached = { shape, keys };
    return this._cached;
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.object) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const { status, ctx } = this._processInputParams(input);
    const { shape, keys: shapeKeys } = this._getCached();
    const extraKeys = [];
    if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
      for (const key in ctx.data) {
        if (!shapeKeys.includes(key)) {
          extraKeys.push(key);
        }
      }
    }
    const pairs = [];
    for (const key of shapeKeys) {
      const keyValidator = shape[key];
      const value = ctx.data[key];
      pairs.push({
        key: { status: "valid", value: key },
        value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (this._def.catchall instanceof ZodNever) {
      const unknownKeys = this._def.unknownKeys;
      if (unknownKeys === "passthrough") {
        for (const key of extraKeys) {
          pairs.push({
            key: { status: "valid", value: key },
            value: { status: "valid", value: ctx.data[key] }
          });
        }
      } else if (unknownKeys === "strict") {
        if (extraKeys.length > 0) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.unrecognized_keys,
            keys: extraKeys
          });
          status.dirty();
        }
      } else if (unknownKeys === "strip") {
      } else {
        throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
      }
    } else {
      const catchall = this._def.catchall;
      for (const key of extraKeys) {
        const value = ctx.data[key];
        pairs.push({
          key: { status: "valid", value: key },
          value: catchall._parse(
            new ParseInputLazyPath(ctx, value, ctx.path, key)
            //, ctx.child(key), value, getParsedType(value)
          ),
          alwaysSet: key in ctx.data
        });
      }
    }
    if (ctx.common.async) {
      return Promise.resolve().then(async () => {
        const syncPairs = [];
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          syncPairs.push({
            key,
            value,
            alwaysSet: pair.alwaysSet
          });
        }
        return syncPairs;
      }).then((syncPairs) => {
        return ParseStatus.mergeObjectSync(status, syncPairs);
      });
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get shape() {
    return this._def.shape();
  }
  strict(message) {
    errorUtil.errToObj;
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strict",
      ...message !== void 0 ? {
        errorMap: (issue, ctx) => {
          const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
          if (issue.code === "unrecognized_keys")
            return {
              message: errorUtil.errToObj(message).message ?? defaultError
            };
          return {
            message: defaultError
          };
        }
      } : {}
    });
  }
  strip() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strip"
    });
  }
  passthrough() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "passthrough"
    });
  }
  // const AugmentFactory =
  //   <Def extends ZodObjectDef>(def: Def) =>
  //   <Augmentation extends ZodRawShape>(
  //     augmentation: Augmentation
  //   ): ZodObject<
  //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
  //     Def["unknownKeys"],
  //     Def["catchall"]
  //   > => {
  //     return new ZodObject({
  //       ...def,
  //       shape: () => ({
  //         ...def.shape(),
  //         ...augmentation,
  //       }),
  //     }) as any;
  //   };
  extend(augmentation) {
    return new _ZodObject({
      ...this._def,
      shape: () => ({
        ...this._def.shape(),
        ...augmentation
      })
    });
  }
  /**
   * Prior to zod@1.0.12 there was a bug in the
   * inferred type of merged objects. Please
   * upgrade if you are experiencing issues.
   */
  merge(merging) {
    const merged = new _ZodObject({
      unknownKeys: merging._def.unknownKeys,
      catchall: merging._def.catchall,
      shape: () => ({
        ...this._def.shape(),
        ...merging._def.shape()
      }),
      typeName: ZodFirstPartyTypeKind.ZodObject
    });
    return merged;
  }
  // merge<
  //   Incoming extends AnyZodObject,
  //   Augmentation extends Incoming["shape"],
  //   NewOutput extends {
  //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
  //       ? Augmentation[k]["_output"]
  //       : k extends keyof Output
  //       ? Output[k]
  //       : never;
  //   },
  //   NewInput extends {
  //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
  //       ? Augmentation[k]["_input"]
  //       : k extends keyof Input
  //       ? Input[k]
  //       : never;
  //   }
  // >(
  //   merging: Incoming
  // ): ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"],
  //   NewOutput,
  //   NewInput
  // > {
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  setKey(key, schema) {
    return this.augment({ [key]: schema });
  }
  // merge<Incoming extends AnyZodObject>(
  //   merging: Incoming
  // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
  // ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"]
  // > {
  //   // const mergedShape = objectUtil.mergeShapes(
  //   //   this._def.shape(),
  //   //   merging._def.shape()
  //   // );
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  catchall(index) {
    return new _ZodObject({
      ...this._def,
      catchall: index
    });
  }
  pick(mask) {
    const shape = {};
    for (const key of util.objectKeys(mask)) {
      if (mask[key] && this.shape[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  omit(mask) {
    const shape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (!mask[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  /**
   * @deprecated
   */
  deepPartial() {
    return deepPartialify(this);
  }
  partial(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      const fieldSchema = this.shape[key];
      if (mask && !mask[key]) {
        newShape[key] = fieldSchema;
      } else {
        newShape[key] = fieldSchema.optional();
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  required(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (mask && !mask[key]) {
        newShape[key] = this.shape[key];
      } else {
        const fieldSchema = this.shape[key];
        let newField = fieldSchema;
        while (newField instanceof ZodOptional) {
          newField = newField._def.innerType;
        }
        newShape[key] = newField;
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  keyof() {
    return createZodEnum(util.objectKeys(this.shape));
  }
};
ZodObject.create = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.strictCreate = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strict",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.lazycreate = (shape, params) => {
  return new ZodObject({
    shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
var ZodUnion = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const options = this._def.options;
    function handleResults(results) {
      for (const result of results) {
        if (result.result.status === "valid") {
          return result.result;
        }
      }
      for (const result of results) {
        if (result.result.status === "dirty") {
          ctx.common.issues.push(...result.ctx.common.issues);
          return result.result;
        }
      }
      const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return Promise.all(options.map(async (option) => {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        return {
          result: await option._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: childCtx
          }),
          ctx: childCtx
        };
      })).then(handleResults);
    } else {
      let dirty = void 0;
      const issues = [];
      for (const option of options) {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        const result = option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: childCtx
        });
        if (result.status === "valid") {
          return result;
        } else if (result.status === "dirty" && !dirty) {
          dirty = { result, ctx: childCtx };
        }
        if (childCtx.common.issues.length) {
          issues.push(childCtx.common.issues);
        }
      }
      if (dirty) {
        ctx.common.issues.push(...dirty.ctx.common.issues);
        return dirty.result;
      }
      const unionErrors = issues.map((issues2) => new ZodError(issues2));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
  }
  get options() {
    return this._def.options;
  }
};
ZodUnion.create = (types, params) => {
  return new ZodUnion({
    options: types,
    typeName: ZodFirstPartyTypeKind.ZodUnion,
    ...processCreateParams(params)
  });
};
var getDiscriminator = (type) => {
  if (type instanceof ZodLazy) {
    return getDiscriminator(type.schema);
  } else if (type instanceof ZodEffects) {
    return getDiscriminator(type.innerType());
  } else if (type instanceof ZodLiteral) {
    return [type.value];
  } else if (type instanceof ZodEnum) {
    return type.options;
  } else if (type instanceof ZodNativeEnum) {
    return util.objectValues(type.enum);
  } else if (type instanceof ZodDefault) {
    return getDiscriminator(type._def.innerType);
  } else if (type instanceof ZodUndefined) {
    return [void 0];
  } else if (type instanceof ZodNull) {
    return [null];
  } else if (type instanceof ZodOptional) {
    return [void 0, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodNullable) {
    return [null, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodBranded) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodReadonly) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodCatch) {
    return getDiscriminator(type._def.innerType);
  } else {
    return [];
  }
};
var ZodDiscriminatedUnion = class _ZodDiscriminatedUnion extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const discriminator = this.discriminator;
    const discriminatorValue = ctx.data[discriminator];
    const option = this.optionsMap.get(discriminatorValue);
    if (!option) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union_discriminator,
        options: Array.from(this.optionsMap.keys()),
        path: [discriminator]
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return option._parseAsync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    } else {
      return option._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    }
  }
  get discriminator() {
    return this._def.discriminator;
  }
  get options() {
    return this._def.options;
  }
  get optionsMap() {
    return this._def.optionsMap;
  }
  /**
   * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
   * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
   * have a different value for each object in the union.
   * @param discriminator the name of the discriminator property
   * @param types an array of object schemas
   * @param params
   */
  static create(discriminator, options, params) {
    const optionsMap = /* @__PURE__ */ new Map();
    for (const type of options) {
      const discriminatorValues = getDiscriminator(type.shape[discriminator]);
      if (!discriminatorValues.length) {
        throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
      }
      for (const value of discriminatorValues) {
        if (optionsMap.has(value)) {
          throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
        }
        optionsMap.set(value, type);
      }
    }
    return new _ZodDiscriminatedUnion({
      typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
      discriminator,
      options,
      optionsMap,
      ...processCreateParams(params)
    });
  }
};
function mergeValues(a, b) {
  const aType = getParsedType(a);
  const bType = getParsedType(b);
  if (a === b) {
    return { valid: true, data: a };
  } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
    const bKeys = util.objectKeys(b);
    const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
    if (a.length !== b.length) {
      return { valid: false };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  } else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) {
    return { valid: true, data: a };
  } else {
    return { valid: false };
  }
}
var ZodIntersection = class extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const handleParsed = (parsedLeft, parsedRight) => {
      if (isAborted(parsedLeft) || isAborted(parsedRight)) {
        return INVALID;
      }
      const merged = mergeValues(parsedLeft.value, parsedRight.value);
      if (!merged.valid) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_intersection_types
        });
        return INVALID;
      }
      if (isDirty(parsedLeft) || isDirty(parsedRight)) {
        status.dirty();
      }
      return { status: status.value, value: merged.data };
    };
    if (ctx.common.async) {
      return Promise.all([
        this._def.left._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }),
        this._def.right._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        })
      ]).then(([left, right]) => handleParsed(left, right));
    } else {
      return handleParsed(this._def.left._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }), this._def.right._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }));
    }
  }
};
ZodIntersection.create = (left, right, params) => {
  return new ZodIntersection({
    left,
    right,
    typeName: ZodFirstPartyTypeKind.ZodIntersection,
    ...processCreateParams(params)
  });
};
var ZodTuple = class _ZodTuple extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (ctx.data.length < this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_small,
        minimum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      return INVALID;
    }
    const rest = this._def.rest;
    if (!rest && ctx.data.length > this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_big,
        maximum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      status.dirty();
    }
    const items = [...ctx.data].map((item, itemIndex) => {
      const schema = this._def.items[itemIndex] || this._def.rest;
      if (!schema)
        return null;
      return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
    }).filter((x) => !!x);
    if (ctx.common.async) {
      return Promise.all(items).then((results) => {
        return ParseStatus.mergeArray(status, results);
      });
    } else {
      return ParseStatus.mergeArray(status, items);
    }
  }
  get items() {
    return this._def.items;
  }
  rest(rest) {
    return new _ZodTuple({
      ...this._def,
      rest
    });
  }
};
ZodTuple.create = (schemas, params) => {
  if (!Array.isArray(schemas)) {
    throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
  }
  return new ZodTuple({
    items: schemas,
    typeName: ZodFirstPartyTypeKind.ZodTuple,
    rest: null,
    ...processCreateParams(params)
  });
};
var ZodRecord = class _ZodRecord extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const pairs = [];
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    for (const key in ctx.data) {
      pairs.push({
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
        value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (ctx.common.async) {
      return ParseStatus.mergeObjectAsync(status, pairs);
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get element() {
    return this._def.valueType;
  }
  static create(first, second, third) {
    if (second instanceof ZodType) {
      return new _ZodRecord({
        keyType: first,
        valueType: second,
        typeName: ZodFirstPartyTypeKind.ZodRecord,
        ...processCreateParams(third)
      });
    }
    return new _ZodRecord({
      keyType: ZodString.create(),
      valueType: first,
      typeName: ZodFirstPartyTypeKind.ZodRecord,
      ...processCreateParams(second)
    });
  }
};
var ZodMap = class extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.map) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.map,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    const pairs = [...ctx.data.entries()].map(([key, value], index) => {
      return {
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
        value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
      };
    });
    if (ctx.common.async) {
      const finalMap = /* @__PURE__ */ new Map();
      return Promise.resolve().then(async () => {
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          if (key.status === "aborted" || value.status === "aborted") {
            return INVALID;
          }
          if (key.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      });
    } else {
      const finalMap = /* @__PURE__ */ new Map();
      for (const pair of pairs) {
        const key = pair.key;
        const value = pair.value;
        if (key.status === "aborted" || value.status === "aborted") {
          return INVALID;
        }
        if (key.status === "dirty" || value.status === "dirty") {
          status.dirty();
        }
        finalMap.set(key.value, value.value);
      }
      return { status: status.value, value: finalMap };
    }
  }
};
ZodMap.create = (keyType, valueType, params) => {
  return new ZodMap({
    valueType,
    keyType,
    typeName: ZodFirstPartyTypeKind.ZodMap,
    ...processCreateParams(params)
  });
};
var ZodSet = class _ZodSet extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.set) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.set,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const def = this._def;
    if (def.minSize !== null) {
      if (ctx.data.size < def.minSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.minSize.message
        });
        status.dirty();
      }
    }
    if (def.maxSize !== null) {
      if (ctx.data.size > def.maxSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.maxSize.message
        });
        status.dirty();
      }
    }
    const valueType = this._def.valueType;
    function finalizeSet(elements2) {
      const parsedSet = /* @__PURE__ */ new Set();
      for (const element of elements2) {
        if (element.status === "aborted")
          return INVALID;
        if (element.status === "dirty")
          status.dirty();
        parsedSet.add(element.value);
      }
      return { status: status.value, value: parsedSet };
    }
    const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
    if (ctx.common.async) {
      return Promise.all(elements).then((elements2) => finalizeSet(elements2));
    } else {
      return finalizeSet(elements);
    }
  }
  min(minSize, message) {
    return new _ZodSet({
      ...this._def,
      minSize: { value: minSize, message: errorUtil.toString(message) }
    });
  }
  max(maxSize, message) {
    return new _ZodSet({
      ...this._def,
      maxSize: { value: maxSize, message: errorUtil.toString(message) }
    });
  }
  size(size, message) {
    return this.min(size, message).max(size, message);
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodSet.create = (valueType, params) => {
  return new ZodSet({
    valueType,
    minSize: null,
    maxSize: null,
    typeName: ZodFirstPartyTypeKind.ZodSet,
    ...processCreateParams(params)
  });
};
var ZodFunction = class _ZodFunction extends ZodType {
  constructor() {
    super(...arguments);
    this.validate = this.implement;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.function) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.function,
        received: ctx.parsedType
      });
      return INVALID;
    }
    function makeArgsIssue(args, error) {
      return makeIssue({
        data: args,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_arguments,
          argumentsError: error
        }
      });
    }
    function makeReturnsIssue(returns, error) {
      return makeIssue({
        data: returns,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_return_type,
          returnTypeError: error
        }
      });
    }
    const params = { errorMap: ctx.common.contextualErrorMap };
    const fn = ctx.data;
    if (this._def.returns instanceof ZodPromise) {
      const me = this;
      return OK(async function(...args) {
        const error = new ZodError([]);
        const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
          error.addIssue(makeArgsIssue(args, e));
          throw error;
        });
        const result = await Reflect.apply(fn, this, parsedArgs);
        const parsedReturns = await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
          error.addIssue(makeReturnsIssue(result, e));
          throw error;
        });
        return parsedReturns;
      });
    } else {
      const me = this;
      return OK(function(...args) {
        const parsedArgs = me._def.args.safeParse(args, params);
        if (!parsedArgs.success) {
          throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
        }
        const result = Reflect.apply(fn, this, parsedArgs.data);
        const parsedReturns = me._def.returns.safeParse(result, params);
        if (!parsedReturns.success) {
          throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
        }
        return parsedReturns.data;
      });
    }
  }
  parameters() {
    return this._def.args;
  }
  returnType() {
    return this._def.returns;
  }
  args(...items) {
    return new _ZodFunction({
      ...this._def,
      args: ZodTuple.create(items).rest(ZodUnknown.create())
    });
  }
  returns(returnType) {
    return new _ZodFunction({
      ...this._def,
      returns: returnType
    });
  }
  implement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  strictImplement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  static create(args, returns, params) {
    return new _ZodFunction({
      args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
      returns: returns || ZodUnknown.create(),
      typeName: ZodFirstPartyTypeKind.ZodFunction,
      ...processCreateParams(params)
    });
  }
};
var ZodLazy = class extends ZodType {
  get schema() {
    return this._def.getter();
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const lazySchema = this._def.getter();
    return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
  }
};
ZodLazy.create = (getter, params) => {
  return new ZodLazy({
    getter,
    typeName: ZodFirstPartyTypeKind.ZodLazy,
    ...processCreateParams(params)
  });
};
var ZodLiteral = class extends ZodType {
  _parse(input) {
    if (input.data !== this._def.value) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_literal,
        expected: this._def.value
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
  get value() {
    return this._def.value;
  }
};
ZodLiteral.create = (value, params) => {
  return new ZodLiteral({
    value,
    typeName: ZodFirstPartyTypeKind.ZodLiteral,
    ...processCreateParams(params)
  });
};
function createZodEnum(values, params) {
  return new ZodEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodEnum,
    ...processCreateParams(params)
  });
}
var ZodEnum = class _ZodEnum extends ZodType {
  _parse(input) {
    if (typeof input.data !== "string") {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(this._def.values);
    }
    if (!this._cache.has(input.data)) {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get options() {
    return this._def.values;
  }
  get enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Values() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  extract(values, newDef = this._def) {
    return _ZodEnum.create(values, {
      ...this._def,
      ...newDef
    });
  }
  exclude(values, newDef = this._def) {
    return _ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
      ...this._def,
      ...newDef
    });
  }
};
ZodEnum.create = createZodEnum;
var ZodNativeEnum = class extends ZodType {
  _parse(input) {
    const nativeEnumValues = util.getValidEnumValues(this._def.values);
    const ctx = this._getOrReturnCtx(input);
    if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(util.getValidEnumValues(this._def.values));
    }
    if (!this._cache.has(input.data)) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get enum() {
    return this._def.values;
  }
};
ZodNativeEnum.create = (values, params) => {
  return new ZodNativeEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
    ...processCreateParams(params)
  });
};
var ZodPromise = class extends ZodType {
  unwrap() {
    return this._def.type;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.promise,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
    return OK(promisified.then((data) => {
      return this._def.type.parseAsync(data, {
        path: ctx.path,
        errorMap: ctx.common.contextualErrorMap
      });
    }));
  }
};
ZodPromise.create = (schema, params) => {
  return new ZodPromise({
    type: schema,
    typeName: ZodFirstPartyTypeKind.ZodPromise,
    ...processCreateParams(params)
  });
};
var ZodEffects = class extends ZodType {
  innerType() {
    return this._def.schema;
  }
  sourceType() {
    return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const effect = this._def.effect || null;
    const checkCtx = {
      addIssue: (arg) => {
        addIssueToContext(ctx, arg);
        if (arg.fatal) {
          status.abort();
        } else {
          status.dirty();
        }
      },
      get path() {
        return ctx.path;
      }
    };
    checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
    if (effect.type === "preprocess") {
      const processed = effect.transform(ctx.data, checkCtx);
      if (ctx.common.async) {
        return Promise.resolve(processed).then(async (processed2) => {
          if (status.value === "aborted")
            return INVALID;
          const result = await this._def.schema._parseAsync({
            data: processed2,
            path: ctx.path,
            parent: ctx
          });
          if (result.status === "aborted")
            return INVALID;
          if (result.status === "dirty")
            return DIRTY(result.value);
          if (status.value === "dirty")
            return DIRTY(result.value);
          return result;
        });
      } else {
        if (status.value === "aborted")
          return INVALID;
        const result = this._def.schema._parseSync({
          data: processed,
          path: ctx.path,
          parent: ctx
        });
        if (result.status === "aborted")
          return INVALID;
        if (result.status === "dirty")
          return DIRTY(result.value);
        if (status.value === "dirty")
          return DIRTY(result.value);
        return result;
      }
    }
    if (effect.type === "refinement") {
      const executeRefinement = (acc) => {
        const result = effect.refinement(acc, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(result);
        }
        if (result instanceof Promise) {
          throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
        }
        return acc;
      };
      if (ctx.common.async === false) {
        const inner = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inner.status === "aborted")
          return INVALID;
        if (inner.status === "dirty")
          status.dirty();
        executeRefinement(inner.value);
        return { status: status.value, value: inner.value };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
          if (inner.status === "aborted")
            return INVALID;
          if (inner.status === "dirty")
            status.dirty();
          return executeRefinement(inner.value).then(() => {
            return { status: status.value, value: inner.value };
          });
        });
      }
    }
    if (effect.type === "transform") {
      if (ctx.common.async === false) {
        const base = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (!isValid(base))
          return INVALID;
        const result = effect.transform(base.value, checkCtx);
        if (result instanceof Promise) {
          throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
        }
        return { status: status.value, value: result };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => {
          if (!isValid(base))
            return INVALID;
          return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
            status: status.value,
            value: result
          }));
        });
      }
    }
    util.assertNever(effect);
  }
};
ZodEffects.create = (schema, effect, params) => {
  return new ZodEffects({
    schema,
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    effect,
    ...processCreateParams(params)
  });
};
ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
  return new ZodEffects({
    schema,
    effect: { type: "preprocess", transform: preprocess },
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    ...processCreateParams(params)
  });
};
var ZodOptional = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.undefined) {
      return OK(void 0);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodOptional.create = (type, params) => {
  return new ZodOptional({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodOptional,
    ...processCreateParams(params)
  });
};
var ZodNullable = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.null) {
      return OK(null);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodNullable.create = (type, params) => {
  return new ZodNullable({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodNullable,
    ...processCreateParams(params)
  });
};
var ZodDefault = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    let data = ctx.data;
    if (ctx.parsedType === ZodParsedType.undefined) {
      data = this._def.defaultValue();
    }
    return this._def.innerType._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  removeDefault() {
    return this._def.innerType;
  }
};
ZodDefault.create = (type, params) => {
  return new ZodDefault({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodDefault,
    defaultValue: typeof params.default === "function" ? params.default : () => params.default,
    ...processCreateParams(params)
  });
};
var ZodCatch = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const newCtx = {
      ...ctx,
      common: {
        ...ctx.common,
        issues: []
      }
    };
    const result = this._def.innerType._parse({
      data: newCtx.data,
      path: newCtx.path,
      parent: {
        ...newCtx
      }
    });
    if (isAsync(result)) {
      return result.then((result2) => {
        return {
          status: "valid",
          value: result2.status === "valid" ? result2.value : this._def.catchValue({
            get error() {
              return new ZodError(newCtx.common.issues);
            },
            input: newCtx.data
          })
        };
      });
    } else {
      return {
        status: "valid",
        value: result.status === "valid" ? result.value : this._def.catchValue({
          get error() {
            return new ZodError(newCtx.common.issues);
          },
          input: newCtx.data
        })
      };
    }
  }
  removeCatch() {
    return this._def.innerType;
  }
};
ZodCatch.create = (type, params) => {
  return new ZodCatch({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodCatch,
    catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
    ...processCreateParams(params)
  });
};
var ZodNaN = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.nan) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.nan,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
};
ZodNaN.create = (params) => {
  return new ZodNaN({
    typeName: ZodFirstPartyTypeKind.ZodNaN,
    ...processCreateParams(params)
  });
};
var BRAND = Symbol("zod_brand");
var ZodBranded = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const data = ctx.data;
    return this._def.type._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  unwrap() {
    return this._def.type;
  }
};
var ZodPipeline = class _ZodPipeline extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.common.async) {
      const handleAsync = async () => {
        const inResult = await this._def.in._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inResult.status === "aborted")
          return INVALID;
        if (inResult.status === "dirty") {
          status.dirty();
          return DIRTY(inResult.value);
        } else {
          return this._def.out._parseAsync({
            data: inResult.value,
            path: ctx.path,
            parent: ctx
          });
        }
      };
      return handleAsync();
    } else {
      const inResult = this._def.in._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
      if (inResult.status === "aborted")
        return INVALID;
      if (inResult.status === "dirty") {
        status.dirty();
        return {
          status: "dirty",
          value: inResult.value
        };
      } else {
        return this._def.out._parseSync({
          data: inResult.value,
          path: ctx.path,
          parent: ctx
        });
      }
    }
  }
  static create(a, b) {
    return new _ZodPipeline({
      in: a,
      out: b,
      typeName: ZodFirstPartyTypeKind.ZodPipeline
    });
  }
};
var ZodReadonly = class extends ZodType {
  _parse(input) {
    const result = this._def.innerType._parse(input);
    const freeze = (data) => {
      if (isValid(data)) {
        data.value = Object.freeze(data.value);
      }
      return data;
    };
    return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodReadonly.create = (type, params) => {
  return new ZodReadonly({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodReadonly,
    ...processCreateParams(params)
  });
};
function cleanParams(params, data) {
  const p = typeof params === "function" ? params(data) : typeof params === "string" ? { message: params } : params;
  const p2 = typeof p === "string" ? { message: p } : p;
  return p2;
}
function custom(check, _params = {}, fatal) {
  if (check)
    return ZodAny.create().superRefine((data, ctx) => {
      const r = check(data);
      if (r instanceof Promise) {
        return r.then((r2) => {
          if (!r2) {
            const params = cleanParams(_params, data);
            const _fatal = params.fatal ?? fatal ?? true;
            ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
          }
        });
      }
      if (!r) {
        const params = cleanParams(_params, data);
        const _fatal = params.fatal ?? fatal ?? true;
        ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
      }
      return;
    });
  return ZodAny.create();
}
var late = {
  object: ZodObject.lazycreate
};
var ZodFirstPartyTypeKind;
(function(ZodFirstPartyTypeKind2) {
  ZodFirstPartyTypeKind2["ZodString"] = "ZodString";
  ZodFirstPartyTypeKind2["ZodNumber"] = "ZodNumber";
  ZodFirstPartyTypeKind2["ZodNaN"] = "ZodNaN";
  ZodFirstPartyTypeKind2["ZodBigInt"] = "ZodBigInt";
  ZodFirstPartyTypeKind2["ZodBoolean"] = "ZodBoolean";
  ZodFirstPartyTypeKind2["ZodDate"] = "ZodDate";
  ZodFirstPartyTypeKind2["ZodSymbol"] = "ZodSymbol";
  ZodFirstPartyTypeKind2["ZodUndefined"] = "ZodUndefined";
  ZodFirstPartyTypeKind2["ZodNull"] = "ZodNull";
  ZodFirstPartyTypeKind2["ZodAny"] = "ZodAny";
  ZodFirstPartyTypeKind2["ZodUnknown"] = "ZodUnknown";
  ZodFirstPartyTypeKind2["ZodNever"] = "ZodNever";
  ZodFirstPartyTypeKind2["ZodVoid"] = "ZodVoid";
  ZodFirstPartyTypeKind2["ZodArray"] = "ZodArray";
  ZodFirstPartyTypeKind2["ZodObject"] = "ZodObject";
  ZodFirstPartyTypeKind2["ZodUnion"] = "ZodUnion";
  ZodFirstPartyTypeKind2["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
  ZodFirstPartyTypeKind2["ZodIntersection"] = "ZodIntersection";
  ZodFirstPartyTypeKind2["ZodTuple"] = "ZodTuple";
  ZodFirstPartyTypeKind2["ZodRecord"] = "ZodRecord";
  ZodFirstPartyTypeKind2["ZodMap"] = "ZodMap";
  ZodFirstPartyTypeKind2["ZodSet"] = "ZodSet";
  ZodFirstPartyTypeKind2["ZodFunction"] = "ZodFunction";
  ZodFirstPartyTypeKind2["ZodLazy"] = "ZodLazy";
  ZodFirstPartyTypeKind2["ZodLiteral"] = "ZodLiteral";
  ZodFirstPartyTypeKind2["ZodEnum"] = "ZodEnum";
  ZodFirstPartyTypeKind2["ZodEffects"] = "ZodEffects";
  ZodFirstPartyTypeKind2["ZodNativeEnum"] = "ZodNativeEnum";
  ZodFirstPartyTypeKind2["ZodOptional"] = "ZodOptional";
  ZodFirstPartyTypeKind2["ZodNullable"] = "ZodNullable";
  ZodFirstPartyTypeKind2["ZodDefault"] = "ZodDefault";
  ZodFirstPartyTypeKind2["ZodCatch"] = "ZodCatch";
  ZodFirstPartyTypeKind2["ZodPromise"] = "ZodPromise";
  ZodFirstPartyTypeKind2["ZodBranded"] = "ZodBranded";
  ZodFirstPartyTypeKind2["ZodPipeline"] = "ZodPipeline";
  ZodFirstPartyTypeKind2["ZodReadonly"] = "ZodReadonly";
})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
var instanceOfType = (cls, params = {
  message: `Input not instance of ${cls.name}`
}) => custom((data) => data instanceof cls, params);
var stringType = ZodString.create;
var numberType = ZodNumber.create;
var nanType = ZodNaN.create;
var bigIntType = ZodBigInt.create;
var booleanType = ZodBoolean.create;
var dateType = ZodDate.create;
var symbolType = ZodSymbol.create;
var undefinedType = ZodUndefined.create;
var nullType = ZodNull.create;
var anyType = ZodAny.create;
var unknownType = ZodUnknown.create;
var neverType = ZodNever.create;
var voidType = ZodVoid.create;
var arrayType = ZodArray.create;
var objectType = ZodObject.create;
var strictObjectType = ZodObject.strictCreate;
var unionType = ZodUnion.create;
var discriminatedUnionType = ZodDiscriminatedUnion.create;
var intersectionType = ZodIntersection.create;
var tupleType = ZodTuple.create;
var recordType = ZodRecord.create;
var mapType = ZodMap.create;
var setType = ZodSet.create;
var functionType = ZodFunction.create;
var lazyType = ZodLazy.create;
var literalType = ZodLiteral.create;
var enumType = ZodEnum.create;
var nativeEnumType = ZodNativeEnum.create;
var promiseType = ZodPromise.create;
var effectsType = ZodEffects.create;
var optionalType = ZodOptional.create;
var nullableType = ZodNullable.create;
var preprocessType = ZodEffects.createWithPreprocess;
var pipelineType = ZodPipeline.create;
var ostring = () => stringType().optional();
var onumber = () => numberType().optional();
var oboolean = () => booleanType().optional();
var coerce = {
  string: (arg) => ZodString.create({ ...arg, coerce: true }),
  number: (arg) => ZodNumber.create({ ...arg, coerce: true }),
  boolean: (arg) => ZodBoolean.create({
    ...arg,
    coerce: true
  }),
  bigint: (arg) => ZodBigInt.create({ ...arg, coerce: true }),
  date: (arg) => ZodDate.create({ ...arg, coerce: true })
};
var NEVER = INVALID;

// ../../packages/protocol/src/errors.ts
var ERROR_CODES = [
  // ---- transport / auth ----
  "UNAUTHENTICATED",
  "DEVICE_REVOKED",
  "INVALID_REQUEST",
  "PROTOCOL_VERSION_MISMATCH",
  "RATE_LIMITED",
  "RETRYABLE_BACKEND",
  "REMOTE_UNAVAILABLE",
  // ---- vault / keys ----
  "INVITATION_INVALID",
  "VAULT_NOT_FOUND",
  "STORAGE_LIMIT",
  "KEY_UNAVAILABLE",
  // ---- objects / revisions ----
  "OBJECT_TOO_LARGE",
  "ATTACHMENT_TOO_LARGE",
  "REVISION_CONFLICT",
  "NOT_FOUND",
  "CORRUPT_ENVELOPE",
  "DECRYPTION_FAILED",
  "UNSUPPORTED_PATH",
  // ---- safety / cost ----
  "BUDGET_PAUSED",
  "MUTATION_RATIO_PAUSED",
  "SYNC_LOOP_SUSPECTED",
  "PAUSED",
  "INITIAL_SYNC_INTERRUPTED",
  // ---- local ----
  "PATH_REJECTED",
  "STALE_REMOTE_HEAD",
  "UNKNOWN"
];
var ERROR_CLASSES = {
  UNAUTHENTICATED: "fatal",
  DEVICE_REVOKED: "fatal",
  INVALID_REQUEST: "fatal",
  PROTOCOL_VERSION_MISMATCH: "fatal",
  RATE_LIMITED: "retryable",
  RETRYABLE_BACKEND: "retryable",
  REMOTE_UNAVAILABLE: "retryable",
  INVITATION_INVALID: "fatal",
  VAULT_NOT_FOUND: "fatal",
  STORAGE_LIMIT: "pause",
  KEY_UNAVAILABLE: "pause",
  OBJECT_TOO_LARGE: "fatal",
  ATTACHMENT_TOO_LARGE: "fatal",
  REVISION_CONFLICT: "fatal",
  // conflict resolution is a user workflow, not an auto-retry
  NOT_FOUND: "fatal",
  CORRUPT_ENVELOPE: "fatal",
  DECRYPTION_FAILED: "fatal",
  UNSUPPORTED_PATH: "fatal",
  BUDGET_PAUSED: "pause",
  MUTATION_RATIO_PAUSED: "pause",
  SYNC_LOOP_SUSPECTED: "pause",
  PAUSED: "pause",
  INITIAL_SYNC_INTERRUPTED: "retryable",
  PATH_REJECTED: "fatal",
  STALE_REMOTE_HEAD: "fatal",
  UNKNOWN: "retryable"
};
var VaultBridgeError = class extends Error {
  code;
  guidance;
  retryable;
  requestId;
  status;
  constructor(code, message, options = {}) {
    super(`${code}: ${message}`);
    if (!ERROR_CODES.includes(code)) {
      throw new TypeError(`VaultBridgeError: unknown error code "${String(code)}"`);
    }
    this.name = "VaultBridgeError";
    this.code = code;
    this.guidance = options.guidance;
    this.retryable = options.retryable ?? ERROR_CLASSES[code] === "retryable";
    this.status = options.status ?? statusForCode(code);
    this.requestId = options.requestId;
  }
  toPayload() {
    return {
      code: this.code,
      message: this.message.replace(/^[A-Z_]+: /, ""),
      guidance: this.guidance,
      retryable: this.retryable,
      requestId: this.requestId,
      status: this.status
    };
  }
};
function statusForCode(code) {
  switch (code) {
    case "UNAUTHENTICATED":
      return 401;
    case "DEVICE_REVOKED":
      return 403;
    case "VAULT_NOT_FOUND":
    case "NOT_FOUND":
      return 404;
    case "REVISION_CONFLICT":
      return 409;
    case "OBJECT_TOO_LARGE":
    case "ATTACHMENT_TOO_LARGE":
      return 413;
    case "INVALID_REQUEST":
    case "UNSUPPORTED_PATH":
    case "INVITATION_INVALID":
    case "CORRUPT_ENVELOPE":
      return 422;
    case "RATE_LIMITED":
      return 429;
    case "DECRYPTION_FAILED":
    case "KEY_UNAVAILABLE":
    case "STORAGE_LIMIT":
    case "BUDGET_PAUSED":
    case "MUTATION_RATIO_PAUSED":
    case "SYNC_LOOP_SUSPECTED":
    case "INITIAL_SYNC_INTERRUPTED":
    case "STALE_REMOTE_HEAD":
    case "PATH_REJECTED":
    case "PAUSED":
      return 400;
    case "PROTOCOL_VERSION_MISMATCH":
    case "RETRYABLE_BACKEND":
    case "REMOTE_UNAVAILABLE":
      return 503;
    default:
      return 500;
  }
}
var VaultBridgeErrorPayloadSchema = external_exports.object({
  code: external_exports.enum(ERROR_CODES),
  message: external_exports.string().min(1),
  guidance: external_exports.string().optional(),
  retryable: external_exports.boolean(),
  requestId: external_exports.string().optional(),
  status: external_exports.number().optional()
});

// ../../packages/protocol/src/wire.ts
var idLike = external_exports.string().min(8).max(128).regex(/^[A-Za-z0-9_-]+$/);
var FileIdSchema = idLike;
var RevisionIdSchema = idLike;
var ObjectIdSchema = idLike;
var b64 = external_exports.string().max(96).regex(/^[A-Za-z0-9+/=]+$/);
var bigB64 = external_exports.string().max(64 * 1024 + 32).regex(/^[A-Za-z0-9+/=]*$/);
var BootstrapRequestSchema = external_exports.object({
  bootstrapToken: external_exports.string().min(16).max(256),
  keyEpoch: external_exports.number().int().min(1).default(1),
  wrappedVaultKeyB64: b64,
  wrappedVaultKeyRecoveryB64: b64,
  kdfParamsJson: external_exports.string().min(2).max(1024),
  flagsCiphertextB64: b64.optional(),
  deviceNameCiphertextB64: b64.optional()
});
var CreateInvitationRequestSchema = external_exports.object({
  ttlSeconds: external_exports.number().int().min(60).max(3600).default(600)
});
var CompletePairingRequestSchema = external_exports.object({
  inviteId: idLike,
  /** sha256(pairingCode + ":" + inviteId) hex — proves possession without the code. */
  inviteProof: external_exports.string().min(32).max(128).regex(/^[a-f0-9]+$/),
  deviceNameCiphertextB64: b64.optional()
});
var ReserveUploadRequestSchema = external_exports.object({
  uploadId: idLike,
  expectedBytes: external_exports.number().int().min(1),
  /** sha256 hex of the exact bytes that will be PUT. */
  expectedSha256: external_exports.string().min(32).max(128).regex(/^[a-f0-9]+$/)
});
var CommitRequestSchema = external_exports.object({
  operationId: idLike,
  fileId: FileIdSchema,
  parentRevisionId: RevisionIdSchema.nullable(),
  newRevisionId: RevisionIdSchema,
  keyEpoch: external_exports.number().int().min(1).max(1e6),
  isTombstone: external_exports.boolean(),
  stagingObjectId: ObjectIdSchema,
  manifestObjectId: ObjectIdSchema,
  /** Encrypted manifest payload (small); storage is handled by the Worker. */
  manifestPayloadB64: bigB64,
  ciphertextSha256: external_exports.string().min(32).max(128).regex(/^[a-f0-9]*$/),
  ciphertextBytes: external_exports.number().int().min(0).max(2 ** 31),
  clientProtocolVersion: external_exports.number().int().min(1).max(1e3)
});
var AckCursorRequestSchema = external_exports.object({
  acknowledgedSeq: external_exports.number().int().min(0)
});

// ../../packages/protocol/src/live.ts
var LIVE_LIMITS = {
  /** Sealed payload ceiling for an incremental update batch (base64url chars). */
  maxUpdateChars: 7e5,
  /** Sealed payload ceiling for a snapshot (base64url chars). Fits Vercel's 4.5 MB body. */
  maxSnapshotChars: 3e6,
  /** Sealed awareness (cursor) payload ceiling. */
  maxAwarenessChars: 8e3,
  /** Docs one poll may watch. */
  maxDocsPerPoll: 24,
  /** Events returned per doc per poll. More means `hasMore`. */
  maxEventsPerDoc: 400,
  /** Longest server-side long-poll wait. */
  maxWaitMs: 8e3,
  /** A cursor is dropped when its device has not refreshed it within this window. */
  awarenessTtlMs: 3e4
};
var LIVE_DOC_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

// ../../packages/crypto/src/aead.ts
var CryptoError = class extends Error {
  detail;
  constructor(detail) {
    super(`CryptoError: ${detail}`);
    this.name = "CryptoError";
    this.detail = detail;
  }
};
var subtle = () => {
  const s = globalThis.crypto?.subtle;
  if (!s) {
    throw new CryptoError("WebCrypto subtle is unavailable in this runtime");
  }
  return s;
};
var HKDF_SALT_VB = new TextEncoder().encode("VaultBridge HKDF v1");
async function sha256Async(data) {
  const d = await subtle().digest("SHA-256", data);
  return new Uint8Array(d);
}
async function sha256HexBytes(data) {
  const digest = await sha256Async(data);
  let out = "";
  for (const b of digest) {
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}

// ../../packages/crypto/src/random.ts
function randomBytes(n) {
  if (!Number.isInteger(n) || n <= 0 || n > 1 << 20) {
    throw new RangeError(`randomBytes: invalid size ${String(n)}`);
  }
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  return buf;
}
function randomId(bytes = 16) {
  return toBase64Url(randomBytes(bytes));
}
function toBase64Url(bytes) {
  const b642 = toBase64(bytes);
  return b642.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function toBase64(bytes) {
  let binary = "";
  const chunk = 32768;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, Math.min(i + chunk, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

// ../../packages/crypto/src/phrase.ts
var CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
var CHARVALUE = /* @__PURE__ */ new Map();
for (let i = 0; i < CHARSET.length; i++) {
  CHARVALUE.set(CHARSET[i], i);
}

// ../../packages/crypto/src/envelope.ts
var textEncoder = new TextEncoder();
var textDecoder = new TextDecoder();

// src/store.ts
function stmt(db, sql, params) {
  return db.prepare(sql).bind(...params);
}
async function one(db, sql, params) {
  const result = await db.prepare(sql).bind(...params).all();
  if (!result.success) {
    throw new VaultBridgeError("RETRYABLE_BACKEND", "statement reported failure");
  }
  return result.results[0] ?? null;
}
async function many(db, sql, params) {
  const result = await db.prepare(sql).bind(...params).all();
  return result.success ? result.results : [];
}
function getVaultRow(db, vaultId) {
  return one(db, "SELECT * FROM vaults WHERE vault_id = ?1", [vaultId]);
}
async function getVaultState(db, vaultId) {
  const vault = await getVaultRow(db, vaultId);
  if (!vault) {
    return null;
  }
  const seqRow = await one(
    db,
    "SELECT MAX(seq) AS max_seq FROM change_events WHERE vault_id = ?1",
    [vaultId]
  );
  return { vault, maxSeq: seqRow?.max_seq ?? 0 };
}
function touchDeviceSeenStatement(db, deviceId, at) {
  return stmt(db, "UPDATE devices SET last_seen_at = ?2 WHERE device_id = ?1", [deviceId, at]);
}
async function bootstrapCreateVault(db, args) {
  const at = args.vault.created_at;
  const vault = args.vault;
  const device = args.device;
  const consume = stmt(
    db,
    `UPDATE bootstrap_credentials
       SET used_at = ?2, used_by_device_id = ?3
     WHERE credential_hash = ?1 AND used_at IS NULL`,
    [args.bootTokenHash, at, device.device_id]
  );
  const insertVault = stmt(
    db,
    `INSERT INTO vaults (vault_id, created_at, protocol_version, key_epoch, wrapped_vmk_b64,
        wrapped_vmk_recovery_b64, kdf_params_json, flags_ciphertext_b64, materials_version, history_retention_days)
     SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10
     WHERE EXISTS (
       SELECT 1 FROM bootstrap_credentials
       WHERE credential_hash = ?11 AND used_by_device_id = ?12 AND used_at IS NOT NULL
     )`,
    [
      vault.vault_id,
      vault.created_at,
      vault.protocol_version,
      vault.key_epoch,
      vault.wrapped_vmk_b64,
      vault.wrapped_vmk_recovery_b64,
      vault.kdf_params_json,
      vault.flags_ciphertext_b64,
      vault.materials_version,
      vault.history_retention_days,
      args.bootTokenHash,
      device.device_id
    ]
  );
  const insertDevice = stmt(
    db,
    `INSERT INTO devices (device_id, vault_id, name_ciphertext_b64, public_key_b64, auth_token_hash, created_at, last_seen_at, revoked_at)
     SELECT ?1,?2,?3,?4,?5,?6,?7,NULL
     WHERE EXISTS (
       SELECT 1 FROM bootstrap_credentials
       WHERE credential_hash = ?8 AND used_by_device_id = ?1 AND used_at IS NOT NULL
     )`,
    [
      device.device_id,
      device.vault_id,
      device.name_ciphertext_b64,
      device.public_key_b64,
      device.auth_token_hash,
      device.created_at,
      device.last_seen_at,
      args.bootTokenHash
    ]
  );
  const insertCursor = stmt(
    db,
    `INSERT OR IGNORE INTO device_cursors (vault_id, device_id, acknowledged_seq, updated_at)
     SELECT ?1,?2,?3,?4
     WHERE EXISTS (
       SELECT 1 FROM bootstrap_credentials
       WHERE credential_hash = ?5 AND used_by_device_id = ?2 AND used_at IS NOT NULL
     )`,
    [device.vault_id, device.device_id, 0, at, args.bootTokenHash]
  );
  const countD1Write = stmt(
    db,
    `INSERT INTO metrics_daily (vault_id, date_utc, d1_writes)
     SELECT ?1, ?2, 1
     WHERE EXISTS (
       SELECT 1 FROM bootstrap_credentials
       WHERE credential_hash = ?3 AND used_by_device_id = ?4 AND used_at IS NOT NULL
     )
     ON CONFLICT(vault_id, date_utc) DO UPDATE SET d1_writes = d1_writes + 1`,
    [device.vault_id, args.dateUtc, args.bootTokenHash, device.device_id]
  );
  await db.batch([consume, insertVault, insertDevice, insertCursor, countD1Write]);
  const owner = await one(
    db,
    "SELECT used_by_device_id FROM bootstrap_credentials WHERE credential_hash = ?1",
    [args.bootTokenHash]
  );
  const createdVault = await getVaultRow(db, vault.vault_id);
  return { created: owner?.used_by_device_id === device.device_id && createdVault != null };
}
async function findUnusedBootstrapCredential(db, credentialHash) {
  const row = await one(
    db,
    "SELECT used_at FROM bootstrap_credentials WHERE credential_hash = ?1",
    [credentialHash]
  );
  return row != null && row.used_at === null;
}
var HEAD_IS_NEW = "(SELECT head_revision_id FROM files WHERE vault_id = ?1 AND file_id = ?2) IS ?3";
function lookupOperationReceipt(db, vaultId, operationId) {
  return one(
    db,
    "SELECT r.revision_id AS revision_id, r.ciphertext_sha256 AS ciphertext_sha256 FROM operation_receipts e JOIN revisions r ON r.vault_id = e.vault_id AND r.revision_id = e.revision_id WHERE e.vault_id = ?1 AND e.operation_id = ?2",
    [vaultId, operationId]
  );
}
async function alreadyCommitted(db, args, existing) {
  if (existing.ciphertext_sha256 !== args.ciphertextSha256) {
    throw new VaultBridgeError("INVALID_REQUEST", "operation id reused for different content", {
      guidance: "Generate a new operation id for a different upload."
    });
  }
  const seqRow = await one(
    db,
    "SELECT seq FROM change_events WHERE vault_id = ?1 AND revision_id = ?2",
    [args.vaultId, existing.revision_id]
  );
  return {
    result: "ALREADY_COMMITTED",
    receipt: { operationId: args.operationId, revisionId: existing.revision_id },
    seq: seqRow?.seq ?? void 0
  };
}
async function commitRevisionConditional(db, args, opts) {
  if (!opts?.skipReceiptPrecheck) {
    const existing = await lookupOperationReceipt(db, args.vaultId, args.operationId);
    if (existing) {
      return alreadyCommitted(db, args, existing);
    }
  }
  const ensureFile = stmt(
    db,
    `INSERT OR IGNORE INTO files (vault_id, file_id, head_revision_id, is_deleted, last_event_seq, created_at)
     VALUES (?1,?2,NULL,0,NULL,?3)`,
    [args.vaultId, args.fileId, args.at]
  );
  const casHead = stmt(
    db,
    `UPDATE files SET head_revision_id = ?4, is_deleted = ?5
     WHERE vault_id = ?1 AND file_id = ?2 AND head_revision_id IS ?3`,
    // ?1 vault ?2 file ?3 expected-parent ?4 new-rev ?5 tombstone
    [args.vaultId, args.fileId, args.parentRevisionId, args.newRevisionId, args.isTombstone ? 1 : 0]
  );
  const insertRevision = stmt(
    db,
    `INSERT INTO revisions (revision_id, vault_id, file_id, parent_revision_id, blob_object_key,
        manifest_object_key, ciphertext_sha256, ciphertext_bytes, device_id, key_epoch, operation_id, is_tombstone, created_at)
     SELECT ?4,?1,?2,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14 WHERE ${HEAD_IS_NEW}`,
    // ?3 consumed by HEAD_IS_NEW; ?4.. = new fields (see column order above)
    [
      args.vaultId,
      args.fileId,
      args.newRevisionId,
      args.newRevisionId,
      args.parentRevisionId,
      args.isTombstone ? null : args.stagedObjectKey,
      args.manifestObjectKey,
      args.ciphertextSha256,
      args.ciphertextBytes,
      args.deviceId,
      args.keyEpoch,
      args.operationId,
      args.isTombstone ? 1 : 0,
      args.at
    ]
  );
  const insertEvent = stmt(
    db,
    `INSERT INTO change_events (vault_id, file_id, revision_id, event_type, created_at)
     SELECT ?1,?2,?4, CASE WHEN ?6 = 1 THEN 'tombstone' ELSE 'commit' END, ?5 WHERE ${HEAD_IS_NEW}`,
    // ?1 vault ?2 file ?3 new-revision (HEAD guard) ?4 new-revision ?5 at ?6 tombstone flag
    [
      args.vaultId,
      args.fileId,
      args.newRevisionId,
      args.newRevisionId,
      args.at,
      args.isTombstone ? 1 : 0
    ]
  );
  const setLastEventSeq = stmt(
    db,
    `UPDATE files SET last_event_seq = (
        SELECT seq FROM change_events
        WHERE vault_id = ?1 AND file_id = ?2 AND revision_id = ?3
        ORDER BY seq DESC LIMIT 1
      )
      WHERE vault_id = ?1 AND file_id = ?2 AND head_revision_id IS ?3`,
    [args.vaultId, args.fileId, args.newRevisionId]
  );
  const insertReceipt = stmt(
    db,
    `INSERT INTO operation_receipts (vault_id, operation_id, result_code, revision_id, ciphertext_sha256, created_at)
     SELECT ?1,?5,'COMMITTED',?4,?6,?7 WHERE ${HEAD_IS_NEW}`,
    // ?1 vault ?2 file ?3 new-revision (HEAD guard) ?4 new-revision ?5 operationId ?6 sha ?7 at
    [
      args.vaultId,
      args.fileId,
      args.newRevisionId,
      args.newRevisionId,
      args.operationId,
      args.ciphertextSha256,
      args.at
    ]
  );
  const batchStatements = [
    ensureFile,
    casHead,
    insertRevision,
    insertEvent,
    setLastEventSeq,
    insertReceipt
  ];
  const results = await db.batch(batchStatements);
  const casMeta = results[1]?.meta;
  if (!casMeta || casMeta.changes === 0) {
    const raced = await lookupOperationReceipt(db, args.vaultId, args.operationId);
    if (raced) {
      return alreadyCommitted(db, args, raced);
    }
    const remote = await getFileRow(db, args.vaultId, args.fileId);
    return {
      result: "CONFLICT",
      conflictHead: remote ? {
        fileId: args.fileId,
        headRevisionId: remote.head_revision_id,
        isDeleted: remote.is_deleted === 1,
        lastEventSeq: remote.last_event_seq ?? 0
      } : void 0
    };
  }
  const seqRow = await one(
    db,
    "SELECT seq FROM change_events WHERE vault_id = ?1 AND revision_id = ?2 ORDER BY seq DESC LIMIT 1",
    [args.vaultId, args.newRevisionId]
  );
  return {
    result: "COMMITTED",
    seq: seqRow?.seq ?? void 0,
    receipt: { operationId: args.operationId, revisionId: args.newRevisionId }
  };
}
function getFileRow(db, vaultId, fileId) {
  return one(db, "SELECT * FROM files WHERE vault_id = ?1 AND file_id = ?2", [vaultId, fileId]);
}
function listChanges(db, vaultId, afterSeq, limit) {
  return many(
    db,
    "SELECT * FROM change_events WHERE vault_id = ?1 AND seq > ?2 ORDER BY seq ASC LIMIT ?3",
    [vaultId, afterSeq, limit]
  );
}
var D1_MAX_SQL_VARIABLES = 100;
async function listRevisionsForEvents(db, vaultId, revisionIds) {
  if (revisionIds.length === 0) {
    return [];
  }
  const chunkSize = D1_MAX_SQL_VARIABLES - 1;
  const rows = [];
  for (let offset = 0; offset < revisionIds.length; offset += chunkSize) {
    const chunk = revisionIds.slice(offset, offset + chunkSize);
    const placeholders = chunk.map((_, i) => `?${i + 2}`).join(",");
    const part = await many(
      db,
      `SELECT * FROM revisions WHERE vault_id = ?1 AND revision_id IN (${placeholders})`,
      [vaultId, ...chunk]
    );
    rows.push(...part);
  }
  return rows;
}
function findRevisionByObjectId(db, vaultId, objectId) {
  return one(
    db,
    "SELECT * FROM revisions WHERE vault_id = ?1 AND (blob_object_key = ?2 OR manifest_object_key = ?2) LIMIT 1",
    [vaultId, objectId]
  );
}
function getRevisionRow(db, vaultId, revisionId) {
  return one(
    db,
    "SELECT * FROM revisions WHERE vault_id = ?1 AND revision_id = ?2 LIMIT 1",
    [vaultId, revisionId]
  );
}
function listFileHistory(db, vaultId, fileId, limit, beforeSeq) {
  const base = `SELECT r.*, e.seq AS event_seq FROM change_events e
       JOIN revisions r ON r.vault_id = e.vault_id AND r.revision_id = e.revision_id
     WHERE e.vault_id = ?1 AND e.file_id = ?2`;
  if (beforeSeq === null) {
    return many(db, `${base} ORDER BY e.seq DESC LIMIT ?3`, [vaultId, fileId, limit]);
  }
  return many(db, `${base} AND e.seq < ?4 ORDER BY e.seq DESC LIMIT ?3`, [
    vaultId,
    fileId,
    limit,
    beforeSeq
  ]);
}
function listDevices(db, vaultId) {
  return many(
    db,
    "SELECT * FROM devices WHERE vault_id = ?1 ORDER BY created_at ASC",
    [vaultId]
  );
}
async function revokeDevice(db, vaultId, deviceId) {
  const result = await stmt(
    db,
    "UPDATE devices SET revoked_at = ?3 WHERE vault_id = ?1 AND device_id = ?2",
    [vaultId, deviceId, (/* @__PURE__ */ new Date()).toISOString()]
  ).run();
  return result.meta.changes > 0;
}
function insertInvitationStatement(db, inv) {
  return stmt(
    db,
    `INSERT INTO invitations (invite_id, vault_id, verifier_hash, expires_at, used_at, used_by_device_id, created_at)
     VALUES (?1,?2,?3,?4,NULL,NULL,?5)`,
    [inv.invite_id, inv.vault_id, inv.verifier_hash, inv.expires_at, inv.created_at]
  );
}
function getInvitationRow(db, inviteId) {
  return one(db, "SELECT * FROM invitations WHERE invite_id = ?1", [inviteId]);
}
function markInvitationUsedStatement(db, inviteId, deviceId, at) {
  return stmt(
    db,
    "UPDATE invitations SET used_at = ?3, used_by_device_id = ?2 WHERE invite_id = ?1 AND used_at IS NULL",
    [inviteId, deviceId, at]
  );
}
async function completePairing(db, args) {
  const device = args.device;
  const insertDevice = stmt(
    db,
    `INSERT INTO devices (device_id, vault_id, name_ciphertext_b64, public_key_b64, auth_token_hash, created_at, last_seen_at, revoked_at)
     SELECT ?1,?2,?3,?4,?5,?6,?7,NULL
     WHERE EXISTS (
       SELECT 1 FROM invitations
       WHERE invite_id = ?8 AND used_by_device_id = ?1 AND used_at IS NOT NULL
     )`,
    [
      device.device_id,
      device.vault_id,
      device.name_ciphertext_b64,
      device.public_key_b64,
      device.auth_token_hash,
      device.created_at,
      device.last_seen_at,
      args.inviteId
    ]
  );
  const insertCursor = stmt(
    db,
    `INSERT OR IGNORE INTO device_cursors (vault_id, device_id, acknowledged_seq, updated_at)
     SELECT ?1,?2,?3,?4
     WHERE EXISTS (
       SELECT 1 FROM invitations
       WHERE invite_id = ?5 AND used_by_device_id = ?2 AND used_at IS NOT NULL
     )`,
    [device.vault_id, device.device_id, args.cursorSeq, args.at, args.inviteId]
  );
  const countD1Write = stmt(
    db,
    `INSERT INTO metrics_daily (vault_id, date_utc, d1_writes)
     SELECT ?1, ?2, 1
     WHERE EXISTS (
       SELECT 1 FROM invitations
       WHERE invite_id = ?3 AND used_by_device_id = ?4 AND used_at IS NOT NULL
     )
     ON CONFLICT(vault_id, date_utc) DO UPDATE SET d1_writes = d1_writes + 1`,
    [device.vault_id, args.dateUtc, args.inviteId, device.device_id]
  );
  await db.batch([
    markInvitationUsedStatement(db, args.inviteId, device.device_id, args.at),
    insertDevice,
    insertCursor,
    countD1Write
  ]);
  const invitation = await getInvitationRow(db, args.inviteId);
  const deviceRow = await one(
    db,
    "SELECT device_id FROM devices WHERE device_id = ?1 AND vault_id = ?2",
    [device.device_id, device.vault_id]
  );
  return { paired: invitation?.used_by_device_id === device.device_id && deviceRow != null };
}
async function usage(db, vaultId, dateUtc) {
  const revisionRow = await one(
    db,
    "SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN is_tombstone = 0 THEN ciphertext_bytes ELSE 0 END), 0) AS bytes FROM revisions WHERE vault_id = ?1",
    [vaultId]
  );
  const deviceRow = await one(
    db,
    "SELECT COUNT(*) AS n FROM devices WHERE vault_id = ?1 AND revoked_at IS NULL",
    [vaultId]
  );
  const objectRow = await one(
    db,
    `SELECT COUNT(*) AS n FROM (
       SELECT 'b:' || blob_object_key AS object_key FROM revisions
        WHERE vault_id = ?1 AND blob_object_key IS NOT NULL AND length(blob_object_key) > 0
       UNION
       SELECT 'm:' || manifest_object_key AS object_key FROM revisions
        WHERE vault_id = ?1 AND manifest_object_key IS NOT NULL AND length(manifest_object_key) > 0
     ) AS stored_objects`,
    [vaultId]
  );
  const metrics = await one(
    db,
    "SELECT * FROM metrics_daily WHERE vault_id = ?1 AND date_utc = ?2",
    [vaultId, dateUtc]
  );
  return {
    storageEstimateBytes: revisionRow?.bytes ?? 0,
    objectCount: objectRow?.n ?? 0,
    revisionCount: revisionRow?.n ?? 0,
    deviceCount: deviceRow?.n ?? 0,
    metrics
  };
}
function bumpMetricStatement(db, vaultId, dateUtc, field, amount) {
  return stmt(
    db,
    `INSERT INTO metrics_daily (vault_id, date_utc, ${field}) VALUES (?1, ?2, ?3)
       ON CONFLICT(vault_id, date_utc) DO UPDATE SET ${field} = ${field} + ?3`,
    [vaultId, dateUtc, amount]
  );
}
async function recordMetrics(db, vaultId, dateUtc, data) {
  try {
    await db.batch([
      bumpMetricStatement(db, vaultId, dateUtc, "data_object_writes", data.writes),
      bumpMetricStatement(db, vaultId, dateUtc, "data_object_reads", data.reads),
      bumpMetricStatement(db, vaultId, dateUtc, "upload_bytes", data.uploadBytes),
      bumpMetricStatement(db, vaultId, dateUtc, "worker_requests", data.requests),
      bumpMetricStatement(db, vaultId, dateUtc, "d1_writes", data.d1Writes ?? 0)
    ]);
  } catch {
  }
}

// src/auth.ts
async function hashSha256Hex(data) {
  const digest = await sha256Async(new TextEncoder().encode(data));
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function authenticate(db, request, options = {}) {
  const header = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) {
    throw new VaultBridgeError("UNAUTHENTICATED", "missing bearer token", {
      guidance: "Send the device token from pairing."
    });
  }
  const token = header.slice(prefix.length).trim();
  if (token.length < 16 || token.length > 256) {
    throw new VaultBridgeError("UNAUTHENTICATED", "malformed token length");
  }
  const tokenHash = await hashSha256Hex(token);
  const row = await db.prepare("SELECT * FROM devices WHERE auth_token_hash = ?1").bind(tokenHash).all();
  let device = row.success ? row.results[0] ?? null : null;
  if (!device) {
    throw new VaultBridgeError("UNAUTHENTICATED", "unknown device credential");
  }
  if (device.revoked_at !== null) {
    throw new VaultBridgeError("DEVICE_REVOKED", "device access was revoked", {
      guidance: "Pair this device again from an authorized one."
    });
  }
  const vault = await getVaultRow(db, device.vault_id);
  if (!vault) {
    throw new VaultBridgeError("VAULT_NOT_FOUND", "vault missing for device");
  }
  if (options.touch === false) {
    return { vault, device, tokenHash };
  }
  try {
    await touchDeviceSeenStatement(db, device.device_id, (/* @__PURE__ */ new Date()).toISOString()).run();
  } catch {
  }
  return { vault, device, tokenHash };
}
var buckets = /* @__PURE__ */ new Map();
var DEFAULT_RATE_LIMIT = { max: 240, windowMs: 6e4 };
function rateLimit(key, options = DEFAULT_RATE_LIMIT) {
  const now = Date.now();
  const entry = buckets.get(key) ?? { hits: [] };
  entry.hits = entry.hits.filter((t) => now - t < options.windowMs);
  entry.hits.push(now);
  buckets.set(key, entry);
  if (buckets.size > 5e4) {
    buckets.clear();
  }
  if (entry.hits.length > options.max) {
    const oldestRemaining = entry.hits[0] ?? now;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((options.windowMs - (now - oldestRemaining)) / 1e3))
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}
function clientKey(request, deviceHint) {
  if (deviceHint) {
    return `d:${deviceHint}`;
  }
  const auth = request.headers.get("authorization") ?? "";
  if (auth.startsWith("Bearer ") && auth.length > 24) {
    return `t:${auth.slice(-24)}`;
  }
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-real-ip") ?? forwarded ?? "local";
  return `ip:${ip}`;
}

// src/object-service.ts
function utcDate(iso = (/* @__PURE__ */ new Date()).toISOString()) {
  return iso.slice(0, 10);
}
var VAULT_PREFIX = "vb-objects";
function contentObjectKey(vaultId, objectId) {
  return `${VAULT_PREFIX}/vaults/${vaultId}/blobs/${objectId}`;
}
function manifestObjectKey(vaultId, objectId) {
  return `${VAULT_PREFIX}/vaults/${vaultId}/manifests/${objectId}`;
}
async function recordMetricsSafe(db, vaultId, counters) {
  try {
    await recordMetrics(db, vaultId, utcDate(), { ...counters, requests: 0 });
  } catch {
  }
}
function sameBytes(left, right) {
  if (left.length !== right.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < left.length; i++) {
    diff |= left[i] ^ right[i];
  }
  return diff === 0;
}
function unavailableBucket() {
  const fail = () => {
    throw new VaultBridgeError(
      "RETRYABLE_BACKEND",
      "object storage is not configured. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN."
    );
  };
  return {
    get: fail,
    head: fail,
    put: fail,
    delete: fail,
    list: fail
  };
}
var ObjectService = class {
  constructor(db, bucket) {
    this.db = db;
    this.bucket = bucket;
  }
  async reserve(args, allowedMaxBytes = PROTOCOL_LIMITS.maxObjectBytes) {
    if (args.expectedBytes > allowedMaxBytes || args.expectedBytes < 1) {
      throw new VaultBridgeError(
        "OBJECT_TOO_LARGE",
        `payload ${args.expectedBytes} outside limits (${allowedMaxBytes})`
      );
    }
    const existing = await this.getSession(args.uploadId);
    if (existing) {
      if (existing.vault_id !== args.vaultId || existing.device_id !== args.deviceId || existing.expected_sha256 !== args.expectedSha256 || existing.expected_bytes !== args.expectedBytes) {
        throw new VaultBridgeError("INVALID_REQUEST", "upload id reused for a different payload");
      }
      return existing;
    }
    const now = Date.now();
    const at = new Date(now).toISOString();
    const expiresAt = new Date(now + PROTOCOL_LIMITS.uploadSessionTtlMs).toISOString();
    const stagingKey = contentObjectKey(args.vaultId, args.uploadId);
    await this.db.prepare(
      `INSERT INTO upload_sessions (upload_id, vault_id, device_id, staging_object_key, expected_sha256, expected_bytes, status, created_at, expires_at, verified_at, revision_id)
         VALUES (?1,?2,?3,?4,?5,?6,'reserved',?7,?8,NULL,NULL)`
    ).bind(
      args.uploadId,
      args.vaultId,
      args.deviceId,
      stagingKey,
      args.expectedSha256,
      args.expectedBytes,
      at,
      expiresAt
    ).run();
    return {
      upload_id: args.uploadId,
      vault_id: args.vaultId,
      device_id: args.deviceId,
      staging_object_key: stagingKey,
      expected_sha256: args.expectedSha256,
      expected_bytes: args.expectedBytes,
      status: "reserved",
      created_at: at,
      expires_at: expiresAt,
      verified_at: null,
      revision_id: null
    };
  }
  /** Stream the encrypted object into the reserved key (idempotent by digest). */
  async putObject(session, body) {
    if (body.length > PROTOCOL_LIMITS.maxObjectBytes) {
      throw new VaultBridgeError("OBJECT_TOO_LARGE", `payload exceeds ${PROTOCOL_LIMITS.maxObjectBytes}`);
    }
    const digest = await sha256HexBytes(body);
    if (digest !== session.expected_sha256) {
      throw new VaultBridgeError("CORRUPT_ENVELOPE", "uploaded bytes do not match reserved digest");
    }
    if (session.status === "staged" || session.status === "committed") {
      return { staged: true };
    }
    if (session.status !== "reserved") {
      throw new VaultBridgeError("INVALID_REQUEST", `upload session is ${session.status}`);
    }
    await this.bucket.put(session.staging_object_key, body);
    await this.markSessionStatus(session.upload_id, "staged");
    await recordMetricsSafe(this.db, session.vault_id, { writes: 1, reads: 0, uploadBytes: body.length });
    return { staged: true };
  }
  async getSession(uploadId) {
    const row = await this.db.prepare("SELECT * FROM upload_sessions WHERE upload_id = ?1").bind(uploadId).all();
    return row.success ? row.results[0] ?? null : null;
  }
  async markSessionStatus(uploadId, status) {
    await this.db.prepare("UPDATE upload_sessions SET status = ?2 WHERE upload_id = ?1").bind(uploadId, status).run();
  }
  async markSessionCommitted(uploadId, revisionId) {
    await this.db.prepare("UPDATE upload_sessions SET status = 'committed', revision_id = ?2 WHERE upload_id = ?1").bind(uploadId, revisionId).run();
  }
  /**
   * Write a manifest once. The id is client-chosen and published on the feed,
   * so a later commit must not replace bytes that an older revision still names.
   * Identical bytes are a retry and do not count as another write.
   */
  async putManifestObject(vaultId, manifestObjectId, payload) {
    if (payload.length > 64 * 1024) {
      throw new VaultBridgeError("OBJECT_TOO_LARGE", "manifest above 64KB is a protocol violation");
    }
    const key = manifestObjectKey(vaultId, manifestObjectId);
    const existing = await this.bucket.get(key);
    if (existing) {
      const previous = await existing.bytes();
      if (!sameBytes(previous, payload)) {
        throw new VaultBridgeError("INVALID_REQUEST", "manifest object id already stores different bytes");
      }
      return { key };
    }
    await this.bucket.put(key, payload);
    await recordMetricsSafe(this.db, vaultId, { writes: 1, reads: 0, uploadBytes: payload.length });
    return { key };
  }
  /** Authorized encrypted object read for GET /objects/:objectId. */
  async readObject(vaultId, objectKey) {
    const body = await this.bucket.get(objectKey);
    if (!body) {
      throw new VaultBridgeError("NOT_FOUND", "object missing from storage");
    }
    await recordMetricsSafe(this.db, vaultId, { reads: 1, writes: 0, uploadBytes: 0 });
    return body.bytes();
  }
  /** Remove an unreferenced object (classified staging cleanup only). */
  async deleteObject(key) {
    await this.bucket.delete(key);
  }
};

// src/turso-http.ts
function tursoPipelineUrl(databaseUrl) {
  let raw = databaseUrl.trim();
  raw = raw.replace(/^libsql:\/\//i, "https://").replace(/^turso:\/\//i, "https://");
  if (!/^https?:\/\//i.test(raw)) {
    raw = `https://${raw}`;
  }
  const url = new URL(raw);
  url.pathname = "/v2/pipeline";
  url.search = "";
  url.hash = "";
  return url.toString();
}
function textArg(value) {
  return { type: "text", value };
}
function intArg(value) {
  return { type: "integer", value: String(value) };
}
function blobArg(bytes) {
  return { type: "blob", base64: bytesToBase64(bytes) };
}
function bytesToBase64(bytes) {
  let bin = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, Math.min(i + chunk, bytes.length));
    bin += String.fromCharCode(...slice);
  }
  return btoa(bin);
}
function base64ToBytes(b642) {
  const bin = atob(b642);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}
function cellText(cell) {
  if (!cell || cell.type === "null") {
    return null;
  }
  if (cell.type === "blob") {
    return null;
  }
  return cell.value ?? null;
}
function cellBytes(cell) {
  if (!cell || cell.type === "null") {
    return null;
  }
  const encoded = cell.base64 ?? cell.value;
  if (!encoded) {
    return null;
  }
  return base64ToBytes(encoded);
}
async function postTursoPipeline(fetchImpl, pipelineUrl, authToken, requests) {
  let response;
  try {
    response = await fetchImpl(pipelineUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${authToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ requests })
    });
  } catch (err) {
    throw new VaultBridgeError("RETRYABLE_BACKEND", `database unreachable: ${err instanceof Error ? err.message : "network"}`);
  }
  if (!response.ok) {
    throw new VaultBridgeError("RETRYABLE_BACKEND", `database returned HTTP ${response.status}`);
  }
  const payload = await response.json();
  const steps = [];
  for (const item of payload.results ?? []) {
    if (item.type === "error") {
      throw new VaultBridgeError("RETRYABLE_BACKEND", item.error?.message ?? "database query failed");
    }
    const responseType = item.response?.type;
    if (responseType === "execute" && item.response?.result) {
      steps.push({ kind: "execute", result: item.response.result });
      continue;
    }
    if (responseType === "close") {
      steps.push({ kind: "close" });
      continue;
    }
    steps.push({ kind: "other" });
  }
  return steps;
}

// src/turso-bucket.ts
var CREATE_OBJECTS = `CREATE TABLE IF NOT EXISTS stored_objects (
  object_key TEXT PRIMARY KEY,
  body BLOB NOT NULL,
  size_bytes INTEGER NOT NULL,
  etag TEXT NOT NULL,
  uploaded_at TEXT NOT NULL
)`;
function likePrefix(prefix) {
  const escaped = prefix.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  return `${escaped}%`;
}
var TursoBucket = class {
  constructor(databaseUrl, authToken, fetchImpl = fetch) {
    this.authToken = authToken;
    this.pipelineUrl = tursoPipelineUrl(databaseUrl);
    this.fetchImpl = fetchImpl.bind(globalThis);
  }
  pipelineUrl;
  ready = null;
  fetchImpl;
  async get(key) {
    const result = await this.execute(
      "SELECT body, size_bytes, etag, uploaded_at FROM stored_objects WHERE object_key = ?",
      [textArg(key)]
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    const bytes = cellBytes(row[0]) ?? new Uint8Array();
    const meta = this.meta(key, row[1], row[2], row[3], bytes.length);
    return { ...meta, bytes: () => Promise.resolve(bytes) };
  }
  async head(key) {
    const result = await this.execute(
      "SELECT size_bytes, etag, uploaded_at FROM stored_objects WHERE object_key = ?",
      [textArg(key)]
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return this.meta(key, row[0], row[1], row[2]);
  }
  async put(key, value, opts) {
    if (opts?.onlyIf) {
      const current = await this.head(key);
      const condition = typeof opts.onlyIf === "string" ? opts.onlyIf : opts.onlyIf.etagDoesNotMatch;
      if (condition !== void 0 && current && condition === current.etag) {
        return null;
      }
    }
    const uploadedAt = (/* @__PURE__ */ new Date()).toISOString();
    const etag = `${value.length.toString(16)}-${uploadedAt}`;
    await this.execute(
      `INSERT INTO stored_objects (object_key, body, size_bytes, etag, uploaded_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(object_key) DO UPDATE SET
         body = excluded.body,
         size_bytes = excluded.size_bytes,
         etag = excluded.etag,
         uploaded_at = excluded.uploaded_at`,
      [textArg(key), blobArg(value), intArg(value.length), textArg(etag), textArg(uploadedAt)]
    );
    return { key, size: value.length, uploadedAt, etag };
  }
  async delete(keyOrKeys) {
    const keys = typeof keyOrKeys === "string" ? [keyOrKeys] : keyOrKeys;
    for (const key of keys) {
      await this.execute("DELETE FROM stored_objects WHERE object_key = ?", [textArg(key)]);
    }
  }
  async list(options) {
    const prefix = options?.prefix ?? "";
    const limit = options?.limit ?? 1e3;
    const result = await this.execute(
      `SELECT object_key, size_bytes, etag, uploaded_at FROM stored_objects
       WHERE object_key LIKE ? ESCAPE '\\'
       ORDER BY object_key
       LIMIT ?`,
      [textArg(likePrefix(prefix)), intArg(limit)]
    );
    const keys = result.rows.map((row) => this.meta(cellText(row[0]) ?? "", row[1], row[2], row[3]));
    return { keys };
  }
  meta(key, sizeCell, etagCell, atCell, fallbackSize = 0) {
    const sizeText = cellText(sizeCell);
    return {
      key,
      size: sizeText === null ? fallbackSize : Number(sizeText),
      etag: cellText(etagCell) ?? "",
      uploadedAt: cellText(atCell) ?? ""
    };
  }
  async execute(sql, args) {
    await this.ensureSchema();
    const steps = await postTursoPipeline(this.fetchImpl, this.pipelineUrl, this.authToken, [
      { type: "execute", stmt: { sql, args } },
      { type: "close" }
    ]);
    return steps.find((step) => step.kind === "execute")?.result ?? { cols: [], rows: [], affected_row_count: 0 };
  }
  async ensureSchema() {
    if (!this.ready) {
      this.ready = postTursoPipeline(this.fetchImpl, this.pipelineUrl, this.authToken, [
        { type: "execute", stmt: { sql: CREATE_OBJECTS } },
        { type: "close" }
      ]).then(() => void 0).catch((err) => {
        this.ready = null;
        throw err;
      });
    }
    await this.ready;
  }
};

// src/live.ts
var PAYLOAD_PATTERN = /^[A-Za-z0-9_-]+$/;
var LIVE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS live_events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    vault_id TEXT NOT NULL,
    doc_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    device_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS live_events_doc ON live_events (vault_id, doc_id, seq)`,
  `CREATE TABLE IF NOT EXISTS live_awareness (
    vault_id TEXT NOT NULL,
    doc_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    updated_ms INTEGER NOT NULL,
    PRIMARY KEY (vault_id, doc_id, device_id)
  )`
];
var ready = /* @__PURE__ */ new WeakSet();
async function ensureLiveSchema(db) {
  if (ready.has(db)) {
    return;
  }
  for (const sql of LIVE_SCHEMA) {
    await db.prepare(sql).run();
  }
  ready.add(db);
}
function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new VaultBridgeError("INVALID_REQUEST", "body must be JSON");
  }
}
function checkDocId(docId) {
  if (!LIVE_DOC_ID_PATTERN.test(docId)) {
    throw new VaultBridgeError("INVALID_REQUEST", "malformed live document id");
  }
}
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function handleLiveRoute(db, request, url, vaultId, subpath) {
  if (!subpath.startsWith("/live/")) {
    return void 0;
  }
  const auth = await authenticate(db, request, { touch: false });
  if (auth.vault.vault_id !== vaultId) {
    throw new VaultBridgeError("DEVICE_REVOKED", "device is not a member of this vault", {
      guidance: "Use the vault this device is paired to."
    });
  }
  await ensureLiveSchema(db);
  if (subpath === "/live/poll" && request.method === "GET") {
    return json(await poll(db, auth, url));
  }
  const docMatch = subpath.match(/^\/live\/docs\/([^/]+)\/(events|awareness)$/);
  if (docMatch && request.method === "POST") {
    const docId = docMatch[1];
    checkDocId(docId);
    if (docMatch[2] === "events") {
      return json(await append(db, auth, docId, await readJson(request)));
    }
    await setAwareness(db, auth, docId, await readJson(request));
    return json({ ok: true });
  }
  return void 0;
}
var appendSchema = external_exports.object({
  kind: external_exports.enum(["u", "s"]),
  payload: external_exports.string().min(1).regex(PAYLOAD_PATTERN),
  ifHead: external_exports.number().int().min(0).optional(),
  replaceUpTo: external_exports.number().int().min(0).optional()
}).strict();
async function append(db, auth, docId, raw) {
  const body = appendSchema.parse(raw);
  const limit = body.kind === "s" ? LIVE_LIMITS.maxSnapshotChars : LIVE_LIMITS.maxUpdateChars;
  if (body.payload.length > limit) {
    throw new VaultBridgeError("INVALID_REQUEST", "live payload too large", { status: 413 });
  }
  if (body.replaceUpTo !== void 0 && body.kind !== "s") {
    throw new VaultBridgeError("INVALID_REQUEST", "only a snapshot can replace events");
  }
  if (body.replaceUpTo !== void 0 && body.ifHead !== void 0) {
    throw new VaultBridgeError("INVALID_REQUEST", "a snapshot cannot also be conditional");
  }
  const vaultId = auth.vault.vault_id;
  const deviceId = auth.device.device_id;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const insert = body.ifHead === void 0 ? db.prepare(
    "INSERT INTO live_events (vault_id, doc_id, kind, device_id, payload, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
  ).bind(vaultId, docId, body.kind, deviceId, body.payload, now) : db.prepare(
    `INSERT INTO live_events (vault_id, doc_id, kind, device_id, payload, created_at)
             SELECT ?1, ?2, ?3, ?4, ?5, ?6
             WHERE COALESCE((SELECT MAX(seq) FROM live_events WHERE vault_id = ?1 AND doc_id = ?2), 0) = ?7`
  ).bind(vaultId, docId, body.kind, deviceId, body.payload, now, body.ifHead);
  const statements = [insert];
  if (body.replaceUpTo !== void 0) {
    statements.push(
      db.prepare("DELETE FROM live_events WHERE vault_id = ?1 AND doc_id = ?2 AND seq <= ?3").bind(vaultId, docId, body.replaceUpTo)
    );
  }
  const results = await db.batch(statements);
  const inserted = results[0];
  const applied = inserted.meta.changes > 0;
  const headRow = await db.prepare("SELECT COALESCE(MAX(seq), 0) AS head FROM live_events WHERE vault_id = ?1 AND doc_id = ?2").bind(vaultId, docId).first();
  return {
    applied,
    seq: applied ? Number(inserted.meta.lastSeq ?? 0) || null : null,
    head: Number(headRow?.head ?? 0)
  };
}
var awarenessSchema = external_exports.object({ payload: external_exports.string().min(1).max(LIVE_LIMITS.maxAwarenessChars).regex(PAYLOAD_PATTERN).nullable() }).strict();
async function setAwareness(db, auth, docId, raw) {
  const body = awarenessSchema.parse(raw);
  const vaultId = auth.vault.vault_id;
  const deviceId = auth.device.device_id;
  const now = Date.now();
  if (body.payload === null) {
    await db.prepare("DELETE FROM live_awareness WHERE vault_id = ?1 AND doc_id = ?2 AND device_id = ?3").bind(vaultId, docId, deviceId).run();
    return;
  }
  await db.batch([
    db.prepare(
      `INSERT INTO live_awareness (vault_id, doc_id, device_id, payload, updated_ms) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT (vault_id, doc_id, device_id) DO UPDATE SET payload = excluded.payload, updated_ms = excluded.updated_ms`
    ).bind(vaultId, docId, deviceId, body.payload, now),
    db.prepare("DELETE FROM live_awareness WHERE vault_id = ?1 AND updated_ms < ?2").bind(vaultId, now - LIVE_LIMITS.awarenessTtlMs * 4)
  ]);
}
function parseWatches(raw) {
  if (!raw) {
    throw new VaultBridgeError("INVALID_REQUEST", "poll needs at least one document");
  }
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const part of raw.split(",")) {
    const [docId, afterRaw] = part.split(":");
    if (!docId) {
      continue;
    }
    checkDocId(docId);
    const after = Number(afterRaw ?? "0");
    if (!Number.isInteger(after) || after < 0) {
      throw new VaultBridgeError("INVALID_REQUEST", "malformed live cursor");
    }
    if (!seen.has(docId)) {
      seen.add(docId);
      out.push({ docId, after });
    }
  }
  if (out.length === 0 || out.length > LIVE_LIMITS.maxDocsPerPoll) {
    throw new VaultBridgeError("INVALID_REQUEST", `poll watches 1-${LIVE_LIMITS.maxDocsPerPoll} documents`);
  }
  return out;
}
async function poll(db, auth, url) {
  const watches = parseWatches(url.searchParams.get("d"));
  const waitRaw = Number(url.searchParams.get("wait") ?? "0");
  const wait = Number.isFinite(waitRaw) ? Math.min(Math.max(0, Math.floor(waitRaw)), LIVE_LIMITS.maxWaitMs) : 0;
  const sinceRaw = Number(url.searchParams.get("as") ?? "0");
  const awarenessSince = Number.isFinite(sinceRaw) ? Math.max(0, sinceRaw) : 0;
  const includeSelf = url.searchParams.get("self") === "1";
  const vaultId = auth.vault.vault_id;
  const me = auth.device.device_id;
  const deadline = Date.now() + wait;
  for (; ; ) {
    const changed = await probe(db, vaultId, me, watches, awarenessSince);
    if (changed.size > 0 || Date.now() >= deadline) {
      const docs = [];
      const awareness = await readAwareness(db, vaultId, me, watches, awarenessSince);
      for (const watch of watches) {
        const delta = changed.has(watch.docId) ? await readEvents(db, vaultId, me, watch, includeSelf) : { docId: watch.docId, events: [], cursor: watch.after, hasMore: false, awareness: [] };
        delta.awareness = awareness.get(watch.docId) ?? [];
        docs.push(delta);
      }
      return { docs, serverMs: Date.now() };
    }
    await sleep(Math.min(200, Math.max(0, deadline - Date.now())));
  }
}
async function probe(db, vaultId, me, watches, awarenessSince) {
  const placeholders = watches.map((_, i) => `?${i + 4}`).join(", ");
  const fresh = Math.max(awarenessSince, Date.now() - LIVE_LIMITS.awarenessTtlMs);
  const rows = await db.prepare(
    `SELECT doc_id AS d, MAX(seq) AS v, 'e' AS t FROM live_events
         WHERE vault_id = ?1 AND doc_id IN (${placeholders}) GROUP BY doc_id
       UNION ALL
       SELECT doc_id AS d, MAX(updated_ms) AS v, 'a' AS t FROM live_awareness
         WHERE vault_id = ?1 AND device_id != ?2 AND updated_ms > ?3 AND doc_id IN (${placeholders}) GROUP BY doc_id`
  ).bind(vaultId, me, fresh, ...watches.map((w) => w.docId)).all();
  const after = new Map(watches.map((w) => [w.docId, w.after]));
  const changed = /* @__PURE__ */ new Set();
  for (const row of rows.results) {
    if (row.t === "a" || Number(row.v) > (after.get(row.d) ?? 0)) {
      changed.add(row.d);
    }
  }
  return changed;
}
async function readEvents(db, vaultId, me, watch, includeSelf) {
  const rows = await db.prepare(
    `SELECT seq, kind, device_id, payload FROM live_events
       WHERE vault_id = ?1 AND doc_id = ?2 AND seq > ?3 ORDER BY seq ASC LIMIT ?4`
  ).bind(vaultId, watch.docId, watch.after, LIVE_LIMITS.maxEventsPerDoc + 1).all();
  const scanned = rows.results.slice(0, LIVE_LIMITS.maxEventsPerDoc);
  const events = [];
  for (const row of scanned) {
    if (!includeSelf && row.device_id === me) {
      continue;
    }
    events.push({ seq: Number(row.seq), kind: row.kind, deviceId: row.device_id, payload: row.payload });
  }
  const last = scanned[scanned.length - 1];
  return {
    docId: watch.docId,
    events,
    cursor: last ? Number(last.seq) : watch.after,
    hasMore: rows.results.length > LIVE_LIMITS.maxEventsPerDoc,
    awareness: []
  };
}
async function readAwareness(db, vaultId, me, watches, awarenessSince) {
  const placeholders = watches.map((_, i) => `?${i + 4}`).join(", ");
  const fresh = Math.max(awarenessSince, Date.now() - LIVE_LIMITS.awarenessTtlMs);
  const rows = await db.prepare(
    `SELECT doc_id, device_id, payload, updated_ms FROM live_awareness
       WHERE vault_id = ?1 AND device_id != ?2 AND updated_ms > ?3 AND doc_id IN (${placeholders})`
  ).bind(vaultId, me, fresh, ...watches.map((w) => w.docId)).all();
  const out = /* @__PURE__ */ new Map();
  for (const row of rows.results) {
    const list = out.get(row.doc_id) ?? [];
    list.push({ deviceId: row.device_id, payload: row.payload, updatedMs: Number(row.updated_ms) });
    out.set(row.doc_id, list);
  }
  return out;
}

// src/routes.ts
var JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};
function jsonResponse(payload, status, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), { status, headers: { ...JSON_HEADERS, ...extraHeaders } });
}
function errorResponse(err, requestId) {
  const payload = err.toPayload();
  const body = { ...payload, requestId };
  return jsonResponse(body, err.status);
}
async function withVault(ctx, vaultId, fn) {
  const auth = await authenticate(ctx.env.DB, ctx.request);
  if (auth.vault.vault_id !== vaultId) {
    throw new VaultBridgeError("DEVICE_REVOKED", "device is not a member of this vault", {
      guidance: "Use the vault this device is paired to."
    });
  }
  if (ctx.request.headers.get("x-requested-vault") && ctx.request.headers.get("x-requested-vault") !== vaultId) {
    throw new VaultBridgeError("INVALID_REQUEST", "header/vault mismatch");
  }
  const client = Number(ctx.request.headers.get("x-vb-protocol") ?? "1") || Number(ctx.url.searchParams.get("protocol") ?? "1");
  const serverVersion = Number(ctx.env.PROTOCOL_VERSION ?? 1);
  if (!Number.isFinite(client) || client > serverVersion) {
    throw new VaultBridgeError("PROTOCOL_VERSION_MISMATCH", `client protocol ${client} newer than server ${serverVersion}`);
  }
  const services = createServices(ctx.env);
  const res = await fn(auth, services);
  await flushMetricsBestEffort(services, auth.vault.vault_id, 1);
  return res;
}
function objectBucket(env2) {
  if (env2.BUCKET) {
    return env2.BUCKET;
  }
  if (env2.TURSO_DATABASE_URL && env2.TURSO_AUTH_TOKEN) {
    return new TursoBucket(env2.TURSO_DATABASE_URL, env2.TURSO_AUTH_TOKEN);
  }
  return unavailableBucket();
}
function createServices(env2) {
  const bucket = objectBucket(env2);
  return {
    db: env2.DB,
    bucket,
    objects: new ObjectService(env2.DB, bucket)
  };
}
async function flushMetricsBestEffort(services, vaultId, requests) {
  try {
    await recordMetrics(services.db, vaultId, utcDate(), { writes: 0, reads: 0, uploadBytes: 0, requests });
  } catch {
  }
}
async function handleHealth(ctx) {
  return jsonResponse(
    {
      status: "ok",
      backendVersion: ctx.env.WORKER_VERSION,
      protocolVersion: Number(ctx.env.PROTOCOL_VERSION ?? 1),
      minClientProtocolVersion: 1
    },
    200
  );
}
var BootstrapSchema = external_exports.object({
  bootstrapToken: external_exports.string().min(16).max(256),
  keyEpoch: external_exports.number().int().min(1).readonly().default(1),
  wrappedVaultKeyB64: external_exports.string().min(8).max(4096),
  wrappedVaultKeyRecoveryB64: external_exports.string().min(8).max(4096),
  kdfParamsJson: external_exports.string().min(2).max(1024),
  flagsCiphertextB64: external_exports.string().max(1024).optional(),
  deviceNameCiphertextB64: external_exports.string().max(1024).optional()
});
async function handleBootstrap(ctx) {
  let parsed;
  try {
    parsed = await ctx.request.json();
  } catch {
    throw new VaultBridgeError("INVALID_REQUEST", "body must be JSON");
  }
  const dto = BootstrapSchema.parse(parsed);
  if (ctx.env.BOOTSTRAP_DISABLED === "true") {
    throw new VaultBridgeError("UNAUTHENTICATED", "bootstrap is disabled on this deployment");
  }
  const credentialHash = await hashSha256Hex(dto.bootstrapToken);
  if (!await findUnusedBootstrapCredential(ctx.env.DB, credentialHash)) {
    throw new VaultBridgeError("UNAUTHENTICATED", "bootstrap credential unknown or already used", {
      guidance: "Deployment generates one credential per vault."
    });
  }
  const vaultId = randomId(12) + randomId(12);
  const deviceId = randomId(12) + randomId(12);
  const deviceToken = `vbd_${randomId(24)}`;
  const tokenHash = await hashSha256Hex(deviceToken);
  const at = (/* @__PURE__ */ new Date()).toISOString();
  const dateUtc = utcDate(at);
  const created = await bootstrapCreateVault(ctx.env.DB, {
    vault: {
      vault_id: vaultId,
      created_at: at,
      protocol_version: 1,
      key_epoch: dto.keyEpoch,
      wrapped_vmk_b64: dto.wrappedVaultKeyB64,
      wrapped_vmk_recovery_b64: dto.wrappedVaultKeyRecoveryB64,
      kdf_params_json: dto.kdfParamsJson,
      flags_ciphertext_b64: dto.flagsCiphertextB64 ?? null,
      materials_version: 1,
      history_retention_days: 3650
    },
    device: {
      device_id: deviceId,
      vault_id: vaultId,
      name_ciphertext_b64: dto.deviceNameCiphertextB64 ?? null,
      public_key_b64: null,
      auth_token_hash: tokenHash,
      created_at: at,
      last_seen_at: at,
      revoked_at: null
    },
    bootTokenHash: credentialHash,
    dateUtc
  });
  if (!created.created) {
    throw new VaultBridgeError("UNAUTHENTICATED", "bootstrap credential unknown or already used", {
      guidance: "Deployment generates one credential per vault."
    });
  }
  return jsonResponse(
    {
      vaultId,
      deviceId,
      deviceToken,
      serverProtocolVersion: 1
    },
    201
  );
}
var InviteSchema = external_exports.object({ ttlSeconds: external_exports.number().int().min(60).max(3600).optional() });
async function handleCreateInvitation(ctx, vaultId) {
  return withVault(ctx, vaultId, async (auth) => {
    let dto = { ttlSeconds: PROTOCOL_LIMITS.invitationTtlMs / 1e3 };
    try {
      const body = await ctx.request.json();
      dto = InviteSchema.parse(body ?? {});
    } catch {
    }
    const now = Date.now();
    const inviteId = randomId(12) + randomId(8);
    const pairingCode = randomId(12).slice(0, 10);
    const verifierHash = await hashSha256Hex(`${pairingCode}:${inviteId}`);
    const expiresAt = new Date(now + (dto.ttlSeconds ?? 600) * 1e3).toISOString();
    await ctx.env.DB.batch([
      insertInvitationStatement(ctx.env.DB, {
        invite_id: inviteId,
        vault_id: auth.vault.vault_id,
        verifier_hash: verifierHash,
        expires_at: expiresAt,
        used_at: null,
        used_by_device_id: null,
        created_at: new Date(now).toISOString()
      })
    ]);
    return jsonResponse({ inviteId, pairingCode, expiresAt }, 201);
  });
}
var PairCompleteSchema = external_exports.object({
  inviteId: external_exports.string().min(8).max(64),
  inviteProof: external_exports.string().min(16).max(256),
  deviceNameCiphertextB64: external_exports.string().max(1024).optional()
});
async function handlePairComplete(ctx) {
  let parsed;
  let dto;
  try {
    parsed = await ctx.request.json();
    dto = PairCompleteSchema.parse(parsed);
  } catch {
    throw new VaultBridgeError("INVALID_REQUEST", "malformed pairing body");
  }
  const invitation = await getInvitationRow(ctx.env.DB, dto.inviteId);
  if (!invitation) {
    throw new VaultBridgeError("INVITATION_INVALID", "unknown invitation");
  }
  if (invitation.used_at !== null) {
    throw new VaultBridgeError("INVITATION_INVALID", "invitation already used", {
      guidance: "Ask an existing device for a new invitation."
    });
  }
  if (Date.parse(invitation.expires_at) < Date.now()) {
    throw new VaultBridgeError("INVITATION_INVALID", "invitation expired");
  }
  if (dto.inviteProof !== invitation.verifier_hash) {
    throw new VaultBridgeError("INVITATION_INVALID", "pairing proof rejected");
  }
  const vault = await getVaultRow(ctx.env.DB, invitation.vault_id);
  if (!vault) {
    throw new VaultBridgeError("VAULT_NOT_FOUND", "vault missing for invitation");
  }
  const deviceId = randomId(12) + randomId(12);
  const deviceToken = `vbd_${randomId(24)}`;
  const at = (/* @__PURE__ */ new Date()).toISOString();
  const maxSeq = (await getVaultState(ctx.env.DB, vault.vault_id))?.maxSeq ?? 0;
  const paired = await completePairing(ctx.env.DB, {
    inviteId: dto.inviteId,
    cursorSeq: maxSeq,
    at,
    dateUtc: utcDate(at),
    device: {
      device_id: deviceId,
      vault_id: vault.vault_id,
      name_ciphertext_b64: dto.deviceNameCiphertextB64 ?? null,
      public_key_b64: null,
      auth_token_hash: await hashSha256Hex(deviceToken),
      created_at: at,
      last_seen_at: at,
      revoked_at: null
    }
  });
  if (!paired.paired) {
    throw new VaultBridgeError("INVITATION_INVALID", "invitation already used", {
      guidance: "Ask an existing device for a new invitation."
    });
  }
  return jsonResponse(
    {
      vaultId: vault.vault_id,
      deviceId,
      deviceToken,
      vaultState: vaultStateFromRow(vault)
    },
    201
  );
}
function vaultStateFromRow(vault) {
  return {
    protocolVersion: vault.protocol_version,
    keyEpoch: vault.key_epoch,
    wrappedVaultKeyB64: vault.wrapped_vmk_b64,
    wrappedVaultKeyRecoveryB64: vault.wrapped_vmk_recovery_b64,
    kdfParamsJson: vault.kdf_params_json,
    flagsCiphertextB64: vault.flags_ciphertext_b64,
    materialsVersion: vault.materials_version
  };
}
var ReserveUploadSchema = external_exports.object({
  uploadId: external_exports.string().min(8).max(64),
  expectedBytes: external_exports.number().int().min(1),
  expectedSha256: external_exports.string().min(32).max(64)
});
async function handleReserveUpload(ctx, vaultId) {
  return withVault(ctx, vaultId, async (auth, services) => {
    let dto;
    try {
      dto = ReserveUploadSchema.parse(await ctx.request.json());
    } catch {
      throw new VaultBridgeError("INVALID_REQUEST", "malformed reserve body");
    }
    const session = await services.objects.reserve(
      {
        vaultId: auth.vault.vault_id,
        deviceId: auth.device.device_id,
        uploadId: dto.uploadId,
        expectedBytes: dto.expectedBytes,
        expectedSha256: dto.expectedSha256
      }
    );
    return jsonResponse(
      {
        uploadId: session.upload_id,
        stagingObjectId: session.upload_id,
        expiresAt: session.expires_at
      },
      201
    );
  });
}
async function handleUploadPut(ctx, vaultId, uploadId) {
  return withVault(ctx, vaultId, async (auth, services) => {
    const session = await services.objects.getSession(uploadId);
    if (!session || session.vault_id !== auth.vault.vault_id || session.device_id !== auth.device.device_id) {
      throw new VaultBridgeError("NOT_FOUND", "upload session not found for this device");
    }
    const body = new Uint8Array(await ctx.request.arrayBuffer());
    await services.objects.putObject(session, body);
    return jsonResponse({ staged: true }, 200);
  });
}
var CommitSchema = external_exports.object({
  operationId: external_exports.string().min(8).max(64),
  fileId: external_exports.string().min(8).max(64),
  parentRevisionId: external_exports.string().max(64).nullable(),
  newRevisionId: external_exports.string().min(8).max(64),
  keyEpoch: external_exports.number().int().min(1),
  isTombstone: external_exports.boolean(),
  stagingObjectId: external_exports.string().min(8).max(64),
  manifestObjectId: external_exports.string().min(8).max(64),
  manifestPayloadB64: external_exports.string().min(16).max(64 * 1024),
  ciphertextSha256: external_exports.string().min(32).max(64),
  ciphertextBytes: external_exports.number().int().min(0),
  clientProtocolVersion: external_exports.number().int().min(1).max(1e3)
});
async function handleCommit(ctx, vaultId) {
  return withVault(ctx, vaultId, async (auth, services) => {
    let dto;
    try {
      dto = CommitSchema.parse(await ctx.request.json());
    } catch (e) {
      throw new VaultBridgeError("INVALID_REQUEST", `commit body invalid: ${e.message}`);
    }
    if (dto.keyEpoch > auth.vault.key_epoch + 1) {
      throw new VaultBridgeError("INVALID_REQUEST", "keyEpoch too advanced (rotation pending key material)");
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    let session = null;
    let sessionWasCommitted = false;
    if (!dto.isTombstone) {
      session = await services.objects.getSession(dto.stagingObjectId);
      if (!session || session.vault_id !== auth.vault.vault_id) {
        throw new VaultBridgeError("INVALID_REQUEST", "staged upload session not found for vault");
      }
      sessionWasCommitted = session.status === "committed";
      const staging = await services.bucket.head(contentObjectKey(auth.vault.vault_id, session.upload_id));
      if (!staging) {
        throw new VaultBridgeError("INVALID_REQUEST", "staged object missing (upload lost?)");
      }
      if (staging.size !== dto.ciphertextBytes) {
        throw new VaultBridgeError("INVALID_REQUEST", "staged size does not match commit payload");
      }
    }
    const manifestPayload = base64ToBytes2(dto.manifestPayloadB64);
    await services.objects.putManifestObject(
      auth.vault.vault_id,
      dto.manifestObjectId,
      manifestPayload
    );
    const outcome = await commitRevisionConditional(ctx.env.DB, {
      vaultId: auth.vault.vault_id,
      deviceId: auth.device.device_id,
      fileId: dto.fileId,
      parentRevisionId: dto.parentRevisionId,
      newRevisionId: dto.newRevisionId,
      operationId: dto.operationId,
      isTombstone: dto.isTombstone,
      keyEpoch: dto.keyEpoch,
      // Object ids are stored short and qualified to full object keys on read;
      // keeps revisions tabular and lookups equality-based.
      stagedObjectKey: session ? session.upload_id : "",
      manifestObjectKey: dto.manifestObjectId,
      ciphertextSha256: dto.ciphertextSha256,
      ciphertextBytes: dto.ciphertextBytes,
      at: now
    });
    if (outcome.result === "CONFLICT") {
      const conflictRevision = outcome.conflictHead?.headRevisionId != null ? await getRevisionRow(ctx.env.DB, auth.vault.vault_id, outcome.conflictHead.headRevisionId) : null;
      return jsonResponse(
        {
          result: "CONFLICT",
          conflict: {
            currentHead: {
              fileId: dto.fileId,
              headRevisionId: outcome.conflictHead?.headRevisionId ?? null,
              isDeleted: outcome.conflictHead?.isDeleted ?? false,
              lastEventSeq: outcome.conflictHead?.lastEventSeq ?? 0
            },
            currentRevision: conflictRevision ? revisionRowToWireOrThrow(conflictRevision) : null
          }
        },
        409
      );
    }
    const receiptPayload = outcome.receipt ? { operationId: outcome.receipt.operationId, revisionId: outcome.receipt.revisionId, seq: outcome.seq ?? null } : null;
    if (outcome.result === "COMMITTED" && session && !sessionWasCommitted) {
      await services.objects.markSessionCommitted(session.upload_id, dto.newRevisionId);
    }
    if (outcome.result === "COMMITTED") {
      try {
        await recordMetrics(ctx.env.DB, auth.vault.vault_id, utcDate(now), {
          writes: 0,
          reads: 0,
          uploadBytes: 0,
          requests: 0,
          d1Writes: 1
        });
      } catch {
      }
    }
    return jsonResponse(
      {
        result: outcome.result,
        receipt: receiptPayload,
        seq: outcome.seq ?? null
      },
      outcome.result === "ALREADY_COMMITTED" ? 200 : 201
    );
  });
}
async function handleChanges(ctx, vaultId) {
  return withVault(ctx, vaultId, async (auth, services) => {
    const afterRaw = Number(ctx.url.searchParams.get("after") ?? "0");
    const limitRaw = Number(ctx.url.searchParams.get("limit") ?? String(PROTOCOL_LIMITS.changesPageSize));
    if (!Number.isFinite(afterRaw) || afterRaw < 0) {
      throw new VaultBridgeError("INVALID_REQUEST", "after must be non-negative integer");
    }
    const limit = Math.min(
      Math.max(Math.floor(Number.isFinite(limitRaw) ? limitRaw : PROTOCOL_LIMITS.changesPageSize), 1),
      PROTOCOL_LIMITS.changesPageSizeMax
    );
    const events = await listChanges(services.db, auth.vault.vault_id, afterRaw, limit);
    const revisions = await listRevisionsForEvents(
      services.db,
      auth.vault.vault_id,
      events.map((e) => e.revision_id)
    );
    const lastSeq = events.length > 0 ? events[events.length - 1].seq : afterRaw;
    const hasMore = events.length === limit;
    return jsonResponse(
      {
        events: events.map((event) => {
          const rev = revisions.find((r) => r.revision_id === event.revision_id);
          return {
            seq: event.seq,
            vaultId: event.vault_id,
            fileId: event.file_id,
            revisionId: event.revision_id,
            eventType: event.event_type,
            createdAt: event.created_at,
            revision: rev ? revisionRowToWireOrThrow(rev) : void 0
          };
        }),
        endCursor: lastSeq,
        hasMore,
        protocolVersion: 1
      },
      200
    );
  });
}
async function handleFileHead(ctx, vaultId, fileId) {
  return withVault(ctx, vaultId, async (auth, services) => {
    const row = await getFileRow(services.db, auth.vault.vault_id, fileId);
    if (!row) {
      throw new VaultBridgeError("NOT_FOUND", "unknown file");
    }
    return jsonify({
      fileId: row.file_id,
      headRevisionId: row.head_revision_id,
      isDeleted: row.is_deleted === 1,
      lastEventSeq: row.last_event_seq ?? 0
    });
  });
}
async function handleRevision(ctx, vaultId, revisionId) {
  return withVault(ctx, vaultId, async (auth, services) => {
    const row = await getRevisionRow(services.db, auth.vault.vault_id, revisionId);
    if (!row) {
      throw new VaultBridgeError("NOT_FOUND", "unknown revision");
    }
    return jsonify({ revision: revisionRowToWireOrThrow(row) });
  });
}
function revisionRowToWireOrThrow(r) {
  return {
    revisionId: r.revision_id,
    parentRevisionId: r.parent_revision_id,
    keyEpoch: r.key_epoch,
    isTombstone: r.is_tombstone === 1,
    ciphertextSha256: r.ciphertext_sha256,
    ciphertextBytes: r.ciphertext_bytes,
    manifestObjectId: r.manifest_object_key,
    blobObjectId: r.blob_object_key,
    deviceId: r.device_id,
    createdAt: r.created_at
  };
}
function jsonify(body) {
  return jsonResponse(body, 200);
}
async function handleObjectGet(ctx, vaultId, objectId) {
  return withVault(ctx, vaultId, async (auth, services) => {
    const rev = await findRevisionByObjectId(services.db, auth.vault.vault_id, objectId);
    if (!rev) {
      throw new VaultBridgeError("NOT_FOUND", "no known object for this vault");
    }
    const isManifest = rev.manifest_object_key === objectId;
    const readKey = isManifest ? manifestObjectKey(auth.vault.vault_id, objectId) : contentObjectKey(auth.vault.vault_id, objectId);
    const bytes = await services.objects.readObject(auth.vault.vault_id, readKey);
    return jsonResponse(
      {
        objectId,
        revisionId: rev.revision_id,
        fileId: rev.file_id,
        kind: isManifest ? "manifest" : "content",
        contentB64: bytesToB64(bytes)
      },
      200
    );
  });
}
function bytesToB64(bytes) {
  let bin = "";
  const chunk = 32768;
  for (let i = 0; i < bytes.length; i += chunk) {
    const s = bytes.subarray(i, Math.min(i + chunk, bytes.length));
    bin += String.fromCharCode(...s);
  }
  return btoa(bin);
}
function base64ToBytes2(b642) {
  const bin = atob(b642);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}
async function handleFileHistory(ctx, vaultId, fileId) {
  return withVault(ctx, vaultId, async (auth, services) => {
    const limitRaw = Number(ctx.url.searchParams.get("limit") ?? "50");
    const beforeRaw = ctx.url.searchParams.get("before");
    const limit = Math.min(Math.max(Math.floor(Number.isFinite(limitRaw) ? limitRaw : 50), 1), 500);
    const before = beforeRaw !== null ? Number(beforeRaw) : null;
    const rows = await listFileHistory(services.db, auth.vault.vault_id, fileId, limit, Number.isFinite(before) ? before : null);
    const file = await getFileRow(services.db, auth.vault.vault_id, fileId);
    return jsonify({
      fileId,
      revisions: rows.map((row) => ({ ...revisionRowToWireOrThrow(row), seq: row.event_seq })),
      hasMore: rows.length === limit
    });
  });
}
async function handleRevoke(ctx, vaultId, deviceId) {
  return withVault(ctx, vaultId, async (auth, services) => {
    if (auth.device.device_id === deviceId) {
      throw new VaultBridgeError("INVALID_REQUEST", "self-revocation must be done from another device", {
        guidance: "Revoke this device from another paired device."
      });
    }
    const revoked = await revokeDevice(services.db, auth.vault.vault_id, deviceId);
    if (!revoked) {
      throw new VaultBridgeError("NOT_FOUND", "device not found in this vault");
    }
    return jsonResponse({ revoked: deviceId }, 200);
  });
}
async function handleListDevices(ctx, vaultId) {
  return withVault(ctx, vaultId, async (auth, services) => {
    const rows = await listDevices(services.db, auth.vault.vault_id);
    return jsonResponse(
      {
        devices: rows.map((row) => ({
          deviceId: row.device_id,
          createdAt: row.created_at,
          lastSeenAt: row.last_seen_at,
          revokedAt: row.revoked_at,
          isCurrent: row.device_id === auth.device.device_id
        }))
      },
      200
    );
  });
}
async function handleUsage(ctx, vaultId) {
  return withVault(ctx, vaultId, async (auth, services) => {
    const data = await usage(services.db, auth.vault.vault_id, utcDate());
    return jsonify({
      storageEstimateBytes: data.storageEstimateBytes,
      objectCount: data.objectCount,
      revisionCount: data.revisionCount,
      deviceCount: data.deviceCount,
      historyRetentionDays: auth.vault.history_retention_days,
      counters: {
        dataObjectWritesToday: data.metrics?.data_object_writes ?? 0,
        dataObjectReadsToday: data.metrics?.data_object_reads ?? 0,
        uploadBytesToday: data.metrics?.upload_bytes ?? 0,
        workerRequestsToday: data.metrics?.worker_requests ?? 0,
        d1WritesToday: data.metrics?.d1_writes ?? 0,
        dateUtc: utcDate()
      }
    });
  });
}
async function handleVaultState(ctx, vaultId) {
  return withVault(ctx, vaultId, async (auth, services) => {
    const state = await getVaultState(services.db, auth.vault.vault_id);
    if (!state) {
      throw new VaultBridgeError("VAULT_NOT_FOUND", "vault missing");
    }
    return jsonify({ vaultState: vaultStateFromRow(state.vault), serverCursor: state.maxSeq });
  });
}
function applyRateLimit(request, env2, requestId) {
  const max = env2.RATE_LIMIT_MAX ? Number(env2.RATE_LIMIT_MAX) : DEFAULT_RATE_LIMIT.max;
  const windowMs = env2.RATE_LIMIT_WINDOW_MS ? Number(env2.RATE_LIMIT_WINDOW_MS) : DEFAULT_RATE_LIMIT.windowMs;
  const live = new URL(request.url).pathname.includes("/live/");
  const liveMax = env2.RATE_LIMIT_LIVE_MAX ? Number(env2.RATE_LIMIT_LIVE_MAX) : 2400;
  const scopedKey = `${env2.RATE_SCOPE ?? "default"}:${live ? "live:" : ""}${clientKey(request)}`;
  const limit = live ? liveMax : max;
  const verdict = rateLimit(scopedKey, {
    max: Number.isFinite(limit) ? limit : DEFAULT_RATE_LIMIT.max,
    windowMs: Number.isFinite(windowMs) ? windowMs : DEFAULT_RATE_LIMIT.windowMs
  });
  if (!verdict.allowed) {
    throw new VaultBridgeError("RATE_LIMITED", "too many requests in window", {
      retryable: true
    });
  }
}
async function route(ctx) {
  const path = ctx.url.pathname.replace(/\/+$/, "") || "/";
  const [, , apiRoot] = path.split("/");
  if (path === "/v1/health" && ctx.request.method === "GET") {
    return handleHealth(ctx);
  }
  if (path === "/v1/bootstrap" && ctx.request.method === "POST") {
    return handleBootstrap(ctx);
  }
  if (path === "/v1/pair/complete" && ctx.request.method === "POST") {
    return handlePairComplete(ctx);
  }
  const vaultMatch = path.match(/^\/v1\/vaults\/([A-Za-z0-9_-]+)(\/.*)?$/);
  if (vaultMatch) {
    const vaultId = vaultMatch[1];
    const subpath = vaultMatch[2] ?? "";
    if (subpath.startsWith("/live/")) {
      return handleLiveRoute(ctx.env.DB, ctx.request, ctx.url, vaultId, subpath);
    }
    if (subpath === "/state") {
      return handleVaultState(ctx, vaultId);
    }
    if (subpath === "/changes") {
      return handleChanges(ctx, vaultId);
    }
    if (subpath === "/uploads" && ctx.request.method === "POST") {
      return handleReserveUpload(ctx, vaultId);
    }
    const uploadPut = subpath.match(/^\/uploads\/([A-Za-z0-9_-]+)$/);
    if (uploadPut && ctx.request.method === "PUT") {
      return handleUploadPut(ctx, vaultId, uploadPut[1]);
    }
    if (subpath === "/commits" && ctx.request.method === "POST") {
      return handleCommit(ctx, vaultId);
    }
    const fileMatch = subpath.match(/^\/files\/([A-Za-z0-9_-]+)(\/.*)?$/);
    if (fileMatch) {
      const fileId = fileMatch[1];
      const sub = fileMatch[2] ?? "";
      if (sub === "/head") {
        return handleFileHead(ctx, vaultId, fileId);
      }
      if (sub === "/history") {
        return handleFileHistory(ctx, vaultId, fileId);
      }
    }
    const revMatch = subpath.match(/^\/revisions\/([A-Za-z0-9_-]+)$/);
    if (revMatch) {
      return handleRevision(ctx, vaultId, revMatch[1]);
    }
    const objectMatch = subpath.match(/^\/objects\/([A-Za-z0-9_-]+)$/);
    if (objectMatch) {
      return handleObjectGet(ctx, vaultId, objectMatch[1]);
    }
    const revokeMatch = subpath.match(/^\/devices\/([A-Za-z0-9_-]+)\/revoke$/);
    if (revokeMatch && ctx.request.method === "POST") {
      return handleRevoke(ctx, vaultId, revokeMatch[1]);
    }
    if (subpath === "/usage") {
      return handleUsage(ctx, vaultId);
    }
    if (subpath === "/devices" && ctx.request.method === "GET") {
      return handleListDevices(ctx, vaultId);
    }
    if (subpath === "/pair/invitations" && ctx.request.method === "POST") {
      return handleCreateInvitation(ctx, vaultId);
    }
  }
  return void 0;
}
async function handleVaultBridgeRequest(request, env2) {
  const requestId = randomId(8);
  const url = new URL(request.url);
  const ctx = { env: env2, request, url, requestId };
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization, content-type, x-vb-protocol"
      }
    });
  }
  try {
    applyRateLimit(request, env2, requestId);
    const response = await route(ctx);
    if (!response) {
      throw new VaultBridgeError("NOT_FOUND", `no route for ${request.method} ${url.pathname}`);
    }
    const withId = response.headers.has("x-vb-request-id") ? response : new Response(response.body, { status: response.status, headers: { ...response.headers, "x-vb-request-id": requestId } });
    return withId;
  } catch (err) {
    let vbError;
    if (err instanceof VaultBridgeError) {
      vbError = err;
    } else if (err instanceof external_exports.ZodError) {
      vbError = new VaultBridgeError("INVALID_REQUEST", `schema: ${err.issues.length} issue(s)`, {
        status: 422
      });
    } else {
      vbError = new VaultBridgeError("RETRYABLE_BACKEND", err instanceof Error ? err.message : "unknown backend failure", {
        status: 500
      });
    }
    return errorResponse(vbError, requestId);
  }
}

// src/turso-db.ts
var MIGRATION_TABLE = `CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
)`;
function splitSqlScript(sql) {
  const withoutLineComments = sql.split("\n").map((line) => {
    const idx = line.indexOf("--");
    return idx === -1 ? line : line.slice(0, idx);
  }).join("\n");
  return withoutLineComments.split(";").map((statement) => statement.trim()).filter((statement) => statement.length > 0);
}
function toArg(value) {
  if (value === null) {
    return { type: "null" };
  }
  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return intArg(value);
    }
    return textArg(String(value));
  }
  if (typeof value === "string") {
    return textArg(value);
  }
  return blobArg(value);
}
function cellValue(cell) {
  if (!cell || cell.type === "null" || cell.type === void 0) {
    return null;
  }
  if (cell.type === "integer") {
    return cell.value === void 0 ? null : Number(cell.value);
  }
  if (cell.type === "float" || cell.type === "real") {
    return cell.value === void 0 ? null : Number(cell.value);
  }
  if (cell.type === "blob") {
    return cell.base64 ?? null;
  }
  return cellText(cell);
}
function rowObject(result, row) {
  const obj = {};
  for (let i = 0; i < result.cols.length; i++) {
    const name = result.cols[i]?.name;
    if (!name) {
      continue;
    }
    obj[name] = cellValue(row[i]);
  }
  return obj;
}
function runMeta(result) {
  const last = result?.last_insert_rowid;
  return {
    success: true,
    meta: {
      changes: Number(result?.affected_row_count ?? 0),
      lastSeq: last === void 0 || last === null ? 0 : Number(last)
    }
  };
}
var TursoStatement = class {
  constructor(db, sqlText) {
    this.db = db;
    this.sqlText = sqlText;
  }
  values = [];
  bind(...values) {
    this.values.push(...values);
    return this;
  }
  get text() {
    return this.sqlText;
  }
  get params() {
    return this.values;
  }
  run() {
    return this.db.executeOne(this.sqlText, this.values);
  }
  async all() {
    const result = await this.db.query(this.sqlText, this.values);
    return { success: true, results: result.rows.map((row) => rowObject(result, row)) };
  }
  async first() {
    const rows = await this.all();
    return rows.results[0] ?? null;
  }
};
var TursoDatabase = class {
  constructor(databaseUrl, authToken, fetchImpl = fetch) {
    this.authToken = authToken;
    this.pipelineUrl = tursoPipelineUrl(databaseUrl);
    this.fetchImpl = fetchImpl.bind(globalThis);
  }
  pipelineUrl;
  fetchImpl;
  prepare(sql) {
    return new TursoStatement(this, sql);
  }
  async batch(statements) {
    if (statements.length === 0) {
      return [];
    }
    const requests = [
      { type: "execute", stmt: { sql: "PRAGMA foreign_keys = ON" } },
      { type: "execute", stmt: { sql: "BEGIN IMMEDIATE" } }
    ];
    for (const statement of statements) {
      requests.push({ type: "execute", stmt: { sql: statement.text, args: statement.params.map(toArg) } });
    }
    requests.push({ type: "execute", stmt: { sql: "COMMIT" } }, { type: "close" });
    const steps = await this.pipeline(requests);
    const executed = steps.filter((step) => step.kind === "execute");
    const firstStatement = 2;
    return statements.map((_, index) => runMeta(executed[firstStatement + index]?.result));
  }
  async executeOne(sql, params) {
    const steps = await this.pipeline([
      { type: "execute", stmt: { sql: "PRAGMA foreign_keys = ON" } },
      { type: "execute", stmt: { sql, args: params.map(toArg) } },
      { type: "close" }
    ]);
    const executed = steps.filter((step) => step.kind === "execute");
    return runMeta(executed[1]?.result);
  }
  async query(sql, params) {
    const steps = await this.pipeline([
      { type: "execute", stmt: { sql: "PRAGMA foreign_keys = ON" } },
      { type: "execute", stmt: { sql, args: params.map(toArg) } },
      { type: "close" }
    ]);
    const executed = steps.filter((step) => step.kind === "execute");
    return executed[1]?.result ?? { cols: [], rows: [], affected_row_count: 0 };
  }
  /** Apply one migration file. Statements run in order; a failure stops the rest. */
  async execScript(sql) {
    for (const statement of splitSqlScript(sql)) {
      await this.executeOne(statement, []);
    }
  }
  async appliedMigrations() {
    await this.executeOne(MIGRATION_TABLE, []);
    const result = await this.query("SELECT name FROM schema_migrations", []);
    const names = /* @__PURE__ */ new Set();
    for (const row of result.rows) {
      const name = cellText(row[0]);
      if (name) {
        names.add(name);
      }
    }
    return names;
  }
  async markMigration(name, at) {
    await this.executeOne("INSERT INTO schema_migrations (name, applied_at) VALUES (?1, ?2)", [name, at]);
  }
  pipeline(requests) {
    return postTursoPipeline(this.fetchImpl, this.pipelineUrl, this.authToken, requests);
  }
};

// src/vercel-entry.ts
var HOP_BY_HOP = /* @__PURE__ */ new Set(["host", "connection", "content-length", "transfer-encoding", "keep-alive"]);
var cached;
function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`missing ${name}`);
  }
  return value;
}
function env() {
  if (cached) {
    return cached;
  }
  const databaseUrl = requiredEnv("TURSO_DATABASE_URL");
  const authToken = requiredEnv("TURSO_AUTH_TOKEN");
  cached = {
    DB: new TursoDatabase(databaseUrl, authToken),
    TURSO_DATABASE_URL: databaseUrl,
    TURSO_AUTH_TOKEN: authToken,
    WORKER_VERSION: process.env.WORKER_VERSION ?? "0.1.0",
    PROTOCOL_VERSION: process.env.PROTOCOL_VERSION ?? "1",
    BOOTSTRAP_DISABLED: process.env.BOOTSTRAP_DISABLED
  };
  return cached;
}
function copyBytes(body) {
  const copy = new ArrayBuffer(body.byteLength);
  new Uint8Array(copy).set(body);
  return copy;
}
async function readBody(req) {
  if (req.method === "GET" || req.method === "HEAD") {
    return void 0;
  }
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return void 0;
  }
  return Buffer.concat(chunks);
}
async function handler(req, res) {
  try {
    const host = req.headers.host ?? "localhost";
    const forwarded = req.headers["x-forwarded-proto"];
    const proto = (Array.isArray(forwarded) ? forwarded[0] : forwarded) || "https";
    const url = new URL(req.url ?? "/", `${proto}://${host}`);
    const hinted = url.searchParams.get("vbpath");
    if (hinted) {
      url.pathname = hinted.startsWith("/") ? hinted : `/${hinted}`;
      url.searchParams.delete("vbpath");
    } else if (url.pathname === "/api/sync" || url.pathname.startsWith("/api/sync/")) {
      url.pathname = "/v1/health";
    }
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === void 0 || HOP_BY_HOP.has(key.toLowerCase())) {
        continue;
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          headers.append(key, item);
        }
      } else {
        headers.set(key, value);
      }
    }
    const body = await readBody(req);
    const request = new Request(url, {
      method: req.method,
      headers,
      body: body ? copyBytes(body) : void 0
    });
    const response = await handleVaultBridgeRequest(request, env());
    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === "content-length") {
        return;
      }
      res.setHeader(key, value);
    });
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.statusCode = 500;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end(err instanceof Error ? err.message : "server error");
  }
}
export {
  handler as default
};
