export const DEFAULT_HOLDINGS = [
  {
    id: "tottus",
    name: "Tottus",
    color: "#E8001C",
  },
  { id: "jumbo", name: "Jumbo", color: "#009A44" },
  {
    id: "unimarc",
    name: "Unimarc",
    color: "#005BAC",
  },
  {
    id: "pronto",
    name: "Pronto Copec",
    color: "#E53935",
  },
];

export const DEFAULT_STORES = [
  {
    storeId: "tkm_kennedy",
    holdingId: "tottus",
    retailerId: "tottus",
    city: "Santiago",
    branchName: "Sucursal Kennedy",
  },
  {
    storeId: "tottus_nunoa",
    holdingId: "tottus",
    retailerId: "tottus",
    city: "Santiago",
    branchName: "Sucursal Ñuñoa",
  },
  {
    storeId: "jumbo_bilbao",
    holdingId: "jumbo",
    retailerId: "jumbo",
    city: "Santiago",
    branchName: "Sucursal Francisco Bilbao",
  },
  {
    storeId: "jumbo_kennedy",
    holdingId: "jumbo",
    retailerId: "jumbo",
    city: "Santiago",
    branchName: "Sucursal Portal La Reina",
  },
  {
    storeId: "unimarc_los_leones",
    holdingId: "unimarc",
    retailerId: "unimarc",
    city: "Santiago",
    branchName: "Sucursal Los Leones",
  },
];

export const DEFAULT_CATEGORY_HIERARCHY = {
  "GROCERY STORE": {
    color: "#4CAF50",
    description: "Despensa y Abarrotes",
    holdings: {
      tottus: ["DESPENSA", "ABARROTES", "CONSERVAS"],
      jumbo: ["ABARROTES", "ACEITES Y ADEREZOS"],
      unimarc: ["DESPENSA"],
      pronto: ["ABARROTES"],
    },
  },
  SWEET: {
    color: "#E91E63",
    description: "Confites, Dulces y Chocolates",
    holdings: {
      tottus: ["CONFITES", "CHOCOLATES", "GALLETAS"],
      jumbo: ["DULCES Y CHOCOLATES", "GALLETAS"],
      unimarc: ["CONFITES Y SNACKS"],
      pronto: ["DULCES"],
    },
  },
  ALCOHOL: {
    color: "#9C27B0",
    description: "Vinos, Cervezas y Licores",
    holdings: {
      tottus: ["LICORES", "VINOS"],
      jumbo: ["VINOS Y CERVEZAS"],
      unimarc: ["LICORES"],
      pronto: ["CERVEZAS"],
    },
  },
  CLEANING: {
    color: "#00BCD4",
    description: "Limpieza del Hogar",
    holdings: {
      tottus: ["LIMPIEZA"],
      jumbo: ["LIMPIEZA DEL HOGAR"],
      unimarc: ["LIMPIEZA"],
      pronto: ["ASEO"],
    },
  },
  DAIRYS: {
    color: "#FFC107",
    description: "Lácteos y Derivados",
    holdings: {
      tottus: ["LÁCTEOS", "QUESOS"],
      jumbo: ["LÁCTEOS Y HUEVOS"],
      unimarc: ["LÁCTEOS"],
      pronto: ["LÁCTEOS"],
    },
  },
  FROZEN: {
    color: "#2196F3",
    description: "Alimentos Congelados",
    holdings: {
      tottus: ["CONGELADOS"],
      jumbo: ["PRODUCTOS CONGELADOS"],
      unimarc: ["CONGELADOS"],
      pronto: ["CONGELADOS"],
    },
  },
  BREAKFAST: {
    color: "#FF9800",
    description: "Desayuno y Cafés",
    holdings: {
      tottus: ["DESAYUNO", "CAFÉ"],
      jumbo: ["CAFÉ Y TÉ"],
      unimarc: ["DESAYUNO"],
      pronto: ["DESAYUNO"],
    },
  },
  SNACKS: {
    color: "#F44336",
    description: "Snacks, Papas y Piqueos",
    holdings: {
      tottus: ["SNACKS", "PIQUEOS"],
      jumbo: ["SNACKS Y PAPAS"],
      unimarc: ["SNACKS"],
      pronto: ["SNACKS"],
    },
  },
  BABY: {
    color: "#EC407A",
    description: "Cuidado del Bebé",
    holdings: {
      tottus: ["BEBÉ", "PAÑALES"],
      jumbo: ["MUNDO BEBÉ"],
      unimarc: ["BEBÉ"],
      pronto: ["BEBÉ"],
    },
  },
  PET: {
    color: "#8D6E63",
    description: "Mascotas",
    holdings: {
      tottus: ["MASCOTAS"],
      jumbo: ["ALIMENTO MASCOTAS"],
      unimarc: ["MASCOTAS"],
      pronto: ["MASCOTAS"],
    },
  },
  DESSERT: {
    color: "#AD1457",
    description: "Postres y Repostería",
    holdings: {
      tottus: ["POSTRES"],
      jumbo: ["REPOSTERÍA Y POSTRES"],
      unimarc: ["POSTRES"],
      pronto: ["POSTRES"],
    },
  },
  CEREALS: {
    color: "#FF7043",
    description: "Cereales y Granola",
    holdings: {
      tottus: ["CEREALES"],
      jumbo: ["CEREALES Y BARRAS"],
      unimarc: ["CEREALES"],
      pronto: ["CEREALES"],
    },
  },
  "CANNED FOOD": {
    color: "#607D8B",
    description: "Conservas y Enlatados",
    holdings: {
      tottus: ["CONSERVAS"],
      jumbo: ["ENLATADOS Y CONSERVAS"],
      unimarc: ["CONSERVAS"],
      pronto: ["CONSERVAS"],
    },
  },
  DETERGENTS: {
    color: "#26A69A",
    description: "Detergentes y Cuidado de Ropa",
    holdings: {
      tottus: ["DETERGENTES"],
      jumbo: ["DETERGENTE Y SUAVIZANTE"],
      unimarc: ["DETERGENTES"],
      pronto: ["DETERGENTES"],
    },
  },
  DRINKS: {
    color: "#42A5F5",
    description: "Bebidas, Aguas y Jugos",
    holdings: {
      tottus: ["BEBIDAS", "AGUAS", "JUGOS"],
      jumbo: ["BEBIDAS Y AGUAS", "NÉCTARES"],
      unimarc: ["BEBIDAS"],
      pronto: ["BEBIDAS"],
    },
  },
  HEALTHY: {
    color: "#66BB6A",
    description: "Alimentos Saludables y Orgánicos",
    holdings: {
      tottus: ["SALUDABLE"],
      jumbo: ["MUNDO SALUDABLE"],
      unimarc: ["SALUDABLE"],
      pronto: ["SALUDABLE"],
    },
  },
  "PAPER ITEMS": {
    color: "#BDBDBD",
    description: "Papeles e Higiénicos",
    holdings: {
      tottus: ["PAPEL HIGIÉNICO", "SERVILLETAS"],
      jumbo: ["PAPELES"],
      unimarc: ["PAPELES"],
      pronto: ["PAPELES"],
    },
  },
  HYGIENE: {
    color: "#8E24AA",
    description: "Higiene y Cuidado Personal",
    holdings: {
      tottus: ["PERFUMERY", "HAIRCARE", "SKINCARE"],
      jumbo: ["CUIDADO DE LA PIEL", "CUIDADO DEL CABELLO", "CUIDADO CORPORAL"],
      unimarc: ["HIGIENE PERSONAL", "CUIDADO CAPILAR"],
      pronto: ["HIGIENE Y ASEO"],
    },
  },
};
