import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    console.log('🔍 Checking Admin Account...');
    try {
        const account = await prisma.account.findUnique({
            where: { accountNumber: '000000000001' }
        });

        if (!account) {
            console.log('❌ Admin account NOT FOUND!');
        } else {
            console.log('✅ Admin account found:', account);
            if (account.pinHash) {
                const isPinValid = await bcrypt.compare('1234', account.pinHash);
                console.log(`🔐 PIN '1234' Valid? ${isPinValid}`);
            } else {
                console.log('⚠️ No PIN Hash set!');
            }
        }
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
