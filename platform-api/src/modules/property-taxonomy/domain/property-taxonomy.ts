export interface PropertyCategoryView {
  id: string;
  code: string;
  name: string;
  homepageHeading: string;
  sortOrder: number;
  homepageVisible: boolean;
  enabled: boolean;
  version: number;
  propertyCount?: number;
}

export interface PropertyTypeView {
  id: string;
  categoryId: string;
  code: string;
  name: string;
  sortOrder: number;
  enabled: boolean;
  version: number;
  propertyCount?: number;
}

export interface CreatePropertyCategoryInput {
  name: string;
  homepageHeading: string;
  sortOrder: number;
  homepageVisible: boolean;
  enabled: boolean;
}

export interface UpdatePropertyCategoryInput extends CreatePropertyCategoryInput {
  version: number;
}

export interface CreatePropertyTypeInput {
  categoryId: string;
  name: string;
  sortOrder: number;
  enabled: boolean;
}

export interface UpdatePropertyTypeInput {
  name: string;
  sortOrder: number;
  enabled: boolean;
  version: number;
}
