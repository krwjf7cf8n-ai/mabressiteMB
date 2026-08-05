import { normalizeEmail } from "./dedup";
import {
  normalizeDateBR,
  normalizeMoneyBR,
  normalizePhoneToE164BR,
  normalizeProperCase,
  normalizeText,
  normalizeUF,
} from "./import-normalize";

/**
 * Catálogo de campos de destino para a importação de leads/clientes.
 * `group` indica onde o valor normalizado é gravado: no próprio Contact,
 * em ContactPreference ou em ContactFinancialInfo (dado sensível, protegido
 * por `imports:view_sensitive_data`/`contacts:view_financial`).
 */
export const IMPORT_CONTACT_FIELDS = [
  { key: "name", label: "Nome", group: "contact", required: true, sensitive: false },
  { key: "phone", label: "Telefone", group: "contact", required: false, sensitive: false },
  { key: "whatsapp", label: "WhatsApp", group: "contact", required: false, sensitive: false },
  { key: "email", label: "E-mail", group: "contact", required: false, sensitive: false },
  { key: "city", label: "Cidade", group: "contact", required: false, sensitive: false },
  { key: "state", label: "Estado (UF)", group: "contact", required: false, sensitive: false },
  { key: "desiredNeighborhood", label: "Bairro de interesse", group: "preference", required: false, sensitive: false },
  { key: "propertyType", label: "Tipo de imóvel", group: "preference", required: false, sensitive: false },
  { key: "minPrice", label: "Faixa mínima", group: "preference", required: false, sensitive: false },
  { key: "maxPrice", label: "Faixa máxima", group: "preference", required: false, sensitive: false },
  { key: "individualIncome", label: "Renda", group: "financial", required: false, sensitive: true },
  { key: "downPaymentAvailable", label: "Entrada", group: "financial", required: false, sensitive: true },
  { key: "fgtsBalanceApprox", label: "FGTS", group: "financial", required: false, sensitive: true },
  { key: "origin", label: "Origem do lead", group: "contact", required: false, sensitive: false },
  { key: "campaign", label: "Campanha", group: "contact", required: false, sensitive: false },
  { key: "notes", label: "Observações", group: "contact", required: false, sensitive: false },
  { key: "ownerUserName", label: "Corretor responsável", group: "contact", required: false, sensitive: false },
  { key: "stageName", label: "Etapa do funil", group: "contact", required: false, sensitive: false },
  { key: "temperature", label: "Temperatura", group: "contact", required: false, sensitive: false },
  { key: "createdAt", label: "Data de criação", group: "contact", required: false, sensitive: false },
  { key: "lastContactAt", label: "Último contato", group: "contact", required: false, sensitive: false },
] as const;

export type ImportContactFieldKey = (typeof IMPORT_CONTACT_FIELDS)[number]["key"];
export type ImportContactMapping = Partial<Record<string, ImportContactFieldKey>>;

const VALID_ORIGINS = ["META_LEAD_ADS", "SITE", "WHATSAPP", "MANUAL", "IMPORTACAO", "INDICACAO", "OUTRO"] as const;
const ORIGIN_SYNONYMS: Record<string, (typeof VALID_ORIGINS)[number]> = {
  meta: "META_LEAD_ADS",
  facebook: "META_LEAD_ADS",
  instagram: "META_LEAD_ADS",
  site: "SITE",
  whatsapp: "WHATSAPP",
  manual: "MANUAL",
  importacao: "IMPORTACAO",
  indicacao: "INDICACAO",
};
const VALID_TEMPERATURES = ["QUENTE", "MORNO", "FRIO"] as const;
const TEMPERATURE_SYNONYMS: Record<string, (typeof VALID_TEMPERATURES)[number]> = {
  quente: "QUENTE",
  morno: "MORNO",
  frio: "FRIO",
  alta: "QUENTE",
  media: "MORNO",
  baixa: "FRIO",
};

function stripAccentsLower(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const FIELD_SYNONYMS: Record<ImportContactFieldKey, string[]> = {
  name: ["nome", "name", "cliente", "lead", "nomecompleto"],
  phone: ["telefone", "fone", "tel", "celular", "phone"],
  whatsapp: ["whatsapp", "whats", "zap", "zapzap"],
  email: ["email", "mail", "emailcliente"],
  city: ["cidade", "city", "municipio"],
  state: ["estado", "uf", "state"],
  desiredNeighborhood: ["bairro", "bairrodeinteresse", "neighborhood", "regiao"],
  propertyType: ["tipodeimovel", "tipoimovel", "propertytype", "tipo"],
  minPrice: ["faixaminima", "precominimo", "valorminimo", "minprice", "faixadeprecominima"],
  maxPrice: ["faixamaxima", "precomaximo", "valormaximo", "maxprice", "faixadeprecomaxima"],
  individualIncome: ["renda", "rendamensal", "income", "rendaindividual"],
  downPaymentAvailable: ["entrada", "valordeentrada", "downpayment", "valorentrada"],
  fgtsBalanceApprox: ["fgts", "saldofgts", "fgtsdisponivel"],
  origin: ["origem", "origemdolead", "source", "canal"],
  campaign: ["campanha", "campaign"],
  notes: ["observacoes", "observacao", "notes", "obs", "anotacoes"],
  ownerUserName: ["corretor", "corretorresponsavel", "responsavel", "owner", "corretorresponsável"],
  stageName: ["etapa", "etapadofunil", "stage", "funil", "etapafunil"],
  temperature: ["temperatura", "temperature"],
  createdAt: ["datadecriacao", "datacriacao", "createdat", "dataentrada", "datadocadastro"],
  lastContactAt: ["ultimocontato", "lastcontact", "dataultimocontato"],
};

/** Sugere automaticamente o mapeamento de colunas do CSV para os campos internos, comparando por texto normalizado. */
export function suggestColumnMapping(headers: string[]): ImportContactMapping {
  const mapping: ImportContactMapping = {};
  const usedTargets = new Set<ImportContactFieldKey>();

  for (const header of headers) {
    const normalizedHeader = stripAccentsLower(header);
    for (const field of IMPORT_CONTACT_FIELDS) {
      if (usedTargets.has(field.key)) continue;
      const synonyms = FIELD_SYNONYMS[field.key];
      if (synonyms.some((syn) => stripAccentsLower(syn) === normalizedHeader)) {
        mapping[header] = field.key;
        usedTargets.add(field.key);
        break;
      }
    }
  }

  return mapping;
}

/**
 * Detecta quando duas colunas de origem foram mapeadas para o mesmo campo de
 * destino — a interface deve pedir confirmação explícita antes de aceitar
 * esse mapeamento (a última coluna processada "vence" silenciosamente
 * senão).
 */
export function findMappingConflicts(mapping: ImportContactMapping): Array<{ target: ImportContactFieldKey; sourceColumns: string[] }> {
  const bySource = new Map<ImportContactFieldKey, string[]>();
  for (const [column, target] of Object.entries(mapping)) {
    if (!target) continue;
    const list = bySource.get(target) ?? [];
    list.push(column);
    bySource.set(target, list);
  }
  return Array.from(bySource.entries())
    .filter(([, columns]) => columns.length > 1)
    .map(([target, sourceColumns]) => ({ target, sourceColumns }));
}

export interface ImportFieldError {
  field: string;
  rawValue: string | null;
  message: string;
}

export interface NormalizedContactRow {
  contact: {
    name: string;
    phone: string | null;
    whatsapp: string | null;
    email: string | null;
    city: string | null;
    state: string | null;
    origin: (typeof VALID_ORIGINS)[number];
    campaign: string | null;
    notes: string | null;
    temperature: (typeof VALID_TEMPERATURES)[number] | null;
    stageId: string | null;
    ownerUserId: string | null;
    createdAt: Date | null;
    lastContactAt: Date | null;
  };
  preference: {
    propertyType: string | null;
    desiredNeighborhoods: string[];
    minPrice: number | null;
    maxPrice: number | null;
  } | null;
  financial: {
    individualIncome: number | null;
    downPaymentAvailable: number | null;
    fgtsBalanceApprox: number | null;
  } | null;
}

export interface ContactImportLookups {
  stagesByName: Map<string, string>; // nome normalizado -> stageId
  usersByNameOrEmail: Map<string, string>; // nome/e-mail normalizado -> userId
}

export interface RowNormalizationResult {
  normalized: NormalizedContactRow | null;
  errors: ImportFieldError[];
  warnings: ImportFieldError[];
}

function getMapped(raw: Record<string, string>, mapping: ImportContactMapping, target: ImportContactFieldKey): string | null {
  const sourceColumn = Object.keys(mapping).find((col) => mapping[col] === target);
  if (!sourceColumn) return null;
  return normalizeText(raw[sourceColumn]);
}

/**
 * Normaliza e valida uma linha do CSV mapeada para os campos de Contact.
 * Nunca inventa dados para campos ausentes — campos não mapeados ou vazios
 * ficam `null` e simplesmente não são alterados/preenchidos.
 */
export function validateAndNormalizeContactRow(
  raw: Record<string, string>,
  mapping: ImportContactMapping,
  lookups: ContactImportLookups,
): RowNormalizationResult {
  const errors: ImportFieldError[] = [];
  const warnings: ImportFieldError[] = [];

  const name = normalizeProperCase(getMapped(raw, mapping, "name"));
  if (!name) {
    errors.push({ field: "name", rawValue: getMapped(raw, mapping, "name"), message: "Campo obrigatório ausente: nome" });
  }

  const rawPhone = getMapped(raw, mapping, "phone");
  const rawWhatsapp = getMapped(raw, mapping, "whatsapp");
  const rawEmail = getMapped(raw, mapping, "email");

  const phone = rawPhone ? normalizePhoneToE164BR(rawPhone) : null;
  if (rawPhone && !phone) errors.push({ field: "phone", rawValue: rawPhone, message: "Telefone incompleto ou inválido" });

  const whatsapp = rawWhatsapp ? normalizePhoneToE164BR(rawWhatsapp) : null;
  if (rawWhatsapp && !whatsapp) errors.push({ field: "whatsapp", rawValue: rawWhatsapp, message: "WhatsApp incompleto ou inválido" });

  const email = rawEmail ? normalizeEmail(rawEmail) : null;
  if (rawEmail && (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    errors.push({ field: "email", rawValue: rawEmail, message: "E-mail inválido" });
  }

  if (!phone && !whatsapp && !email) {
    errors.push({ field: "phone/whatsapp/email", rawValue: null, message: "Informe ao menos telefone, WhatsApp ou e-mail" });
  }

  const city = normalizeProperCase(getMapped(raw, mapping, "city"));
  const rawState = getMapped(raw, mapping, "state");
  const state = rawState ? normalizeUF(rawState) : null;
  if (rawState && !state) warnings.push({ field: "state", rawValue: rawState, message: "Estado (UF) não reconhecido — campo ignorado" });

  const rawOrigin = getMapped(raw, mapping, "origin");
  let origin: (typeof VALID_ORIGINS)[number] = "IMPORTACAO";
  if (rawOrigin) {
    const upper = rawOrigin.toUpperCase().replace(/\s+/g, "_");
    const synonymMatch = ORIGIN_SYNONYMS[stripAccentsLower(rawOrigin)];
    if ((VALID_ORIGINS as readonly string[]).includes(upper)) {
      origin = upper as (typeof VALID_ORIGINS)[number];
    } else if (synonymMatch) {
      origin = synonymMatch;
    } else {
      errors.push({ field: "origin", rawValue: rawOrigin, message: "Origem do lead desconhecida" });
    }
  }

  const rawTemperature = getMapped(raw, mapping, "temperature");
  let temperature: (typeof VALID_TEMPERATURES)[number] | null = null;
  if (rawTemperature) {
    const upper = rawTemperature.toUpperCase();
    const synonymMatch = TEMPERATURE_SYNONYMS[stripAccentsLower(rawTemperature)];
    if ((VALID_TEMPERATURES as readonly string[]).includes(upper)) {
      temperature = upper as (typeof VALID_TEMPERATURES)[number];
    } else if (synonymMatch) {
      temperature = synonymMatch;
    } else {
      errors.push({ field: "temperature", rawValue: rawTemperature, message: "Temperatura desconhecida" });
    }
  }

  const rawStageName = getMapped(raw, mapping, "stageName");
  let stageId: string | null = null;
  if (rawStageName) {
    stageId = lookups.stagesByName.get(stripAccentsLower(rawStageName)) ?? null;
    if (!stageId) errors.push({ field: "stageName", rawValue: rawStageName, message: "Etapa do funil desconhecida" });
  }

  const rawOwnerName = getMapped(raw, mapping, "ownerUserName");
  let ownerUserId: string | null = null;
  if (rawOwnerName) {
    ownerUserId = lookups.usersByNameOrEmail.get(stripAccentsLower(rawOwnerName)) ?? null;
    if (!ownerUserId) errors.push({ field: "ownerUserName", rawValue: rawOwnerName, message: "Corretor responsável inexistente" });
  }

  const rawCreatedAt = getMapped(raw, mapping, "createdAt");
  const createdAt = rawCreatedAt ? normalizeDateBR(rawCreatedAt) : null;
  if (rawCreatedAt && !createdAt) errors.push({ field: "createdAt", rawValue: rawCreatedAt, message: "Data de criação inválida" });

  const rawLastContactAt = getMapped(raw, mapping, "lastContactAt");
  const lastContactAt = rawLastContactAt ? normalizeDateBR(rawLastContactAt) : null;
  if (rawLastContactAt && !lastContactAt) errors.push({ field: "lastContactAt", rawValue: rawLastContactAt, message: "Data de último contato inválida" });

  const campaign = normalizeText(getMapped(raw, mapping, "campaign"));
  const notes = normalizeText(getMapped(raw, mapping, "notes"));

  // Preferências (opcional — só monta o objeto se algum campo veio preenchido)
  const propertyType = normalizeText(getMapped(raw, mapping, "propertyType"));
  const rawNeighborhood = getMapped(raw, mapping, "desiredNeighborhood");
  const desiredNeighborhoods = rawNeighborhood ? rawNeighborhood.split(/[,;]/).map((n) => n.trim()).filter(Boolean) : [];
  const rawMinPrice = getMapped(raw, mapping, "minPrice");
  const minPrice = rawMinPrice ? normalizeMoneyBR(rawMinPrice) : null;
  if (rawMinPrice && minPrice === null) errors.push({ field: "minPrice", rawValue: rawMinPrice, message: "Valor de faixa mínima incompatível" });
  const rawMaxPrice = getMapped(raw, mapping, "maxPrice");
  const maxPrice = rawMaxPrice ? normalizeMoneyBR(rawMaxPrice) : null;
  if (rawMaxPrice && maxPrice === null) errors.push({ field: "maxPrice", rawValue: rawMaxPrice, message: "Valor de faixa máxima incompatível" });

  const hasPreferenceData = Boolean(propertyType || desiredNeighborhoods.length > 0 || minPrice !== null || maxPrice !== null);

  // Dados financeiros (sensíveis)
  const rawIncome = getMapped(raw, mapping, "individualIncome");
  const individualIncome = rawIncome ? normalizeMoneyBR(rawIncome) : null;
  if (rawIncome && individualIncome === null) errors.push({ field: "individualIncome", rawValue: rawIncome, message: "Valor de renda incompatível" });
  const rawDownPayment = getMapped(raw, mapping, "downPaymentAvailable");
  const downPaymentAvailable = rawDownPayment ? normalizeMoneyBR(rawDownPayment) : null;
  if (rawDownPayment && downPaymentAvailable === null) errors.push({ field: "downPaymentAvailable", rawValue: rawDownPayment, message: "Valor de entrada incompatível" });
  const rawFgts = getMapped(raw, mapping, "fgtsBalanceApprox");
  const fgtsBalanceApprox = rawFgts ? normalizeMoneyBR(rawFgts) : null;
  if (rawFgts && fgtsBalanceApprox === null) errors.push({ field: "fgtsBalanceApprox", rawValue: rawFgts, message: "Valor de FGTS incompatível" });

  const hasFinancialData = individualIncome !== null || downPaymentAvailable !== null || fgtsBalanceApprox !== null;

  if (errors.length > 0 || !name) {
    return { normalized: null, errors, warnings };
  }

  return {
    normalized: {
      contact: {
        name: name as string,
        phone,
        whatsapp,
        email,
        city,
        state,
        origin,
        campaign,
        notes,
        temperature,
        stageId,
        ownerUserId,
        createdAt,
        lastContactAt,
      },
      preference: hasPreferenceData ? { propertyType, desiredNeighborhoods, minPrice, maxPrice } : null,
      financial: hasFinancialData ? { individualIncome, downPaymentAvailable, fgtsBalanceApprox } : null,
    },
    errors,
    warnings,
  };
}
