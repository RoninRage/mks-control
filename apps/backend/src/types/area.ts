export interface Area {
  _id?: string;
  _rev?: string;
  id: string;
  name: string;
  description: string;
  bereichsleiterIds?: string[];
}

export interface AreaWithMeta extends Area {
  _id: string;
  _rev: string;
}
