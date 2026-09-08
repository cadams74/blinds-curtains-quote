CREATE TABLE IF NOT EXISTS "curtain_accessories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	CONSTRAINT "curtain_accessories_name_unique" UNIQUE("name")
);
