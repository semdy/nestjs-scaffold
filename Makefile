.PHONY: install dev infra infra-mysql migrate up down build test lint

install:
	npm install

infra:
	docker compose -f docker-compose.dev.yml up -d postgres redis rabbitmq

infra-mysql:
	docker compose -f docker-compose.dev.yml --profile mysql up -d mysql redis rabbitmq

dev:
	npm run start:dev

migrate:
	npm run migration:run

up:
	docker compose up --build -d

down:
	docker compose -f docker-compose.dev.yml down
	docker compose down

build:
	npm run build

test:
	npm run test

lint:
	npm run lint
