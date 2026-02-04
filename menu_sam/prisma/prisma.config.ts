export const db = {
  provider: 'mysql',
  url: process.env.DATABASE_URL || 'mysql://root:@localhost:3306/sam_site',
};
