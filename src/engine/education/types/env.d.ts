declare global {
    namespace NodeJS {
        interface ProcessEnv {
            VK_ENTITIES: string;
            DATABASE_URL: string;
        }
    }
}