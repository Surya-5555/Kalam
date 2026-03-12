import { Injectable, OnModuleInit, Logger } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
    private readonly logger = new Logger(PrismaService.name);

    constructor () { // Passing it to prismaClient constructor which will be extended by prismaService
        super({
            log : ['query', 'info', 'warn', 'error'],
        });
    }

    async onModuleInit() {
        try {
            await this.$connect();
            this.logger.log('Connected to PostgreSQL via Prisma');
        } catch (error) {
            this.logger.error('Error connecting to PostgreSQL', error);
        }
    }

    async onModuleDestroy() {
        await this.$disconnect();
        this.logger.log('Disconnected from PostgreSQL');
    }
    
}

