export interface Area {
  _id?: string;
  _rev?: string;
  type: 'area';
  id: string;
  name: string;
  description: string;
  bereichsleiterIds?: string[];
}

export interface AreaWithMeta extends Area {
  _id: string;
  _rev: string;
}
