var Nodebatis = require('./index.js');
const nodebatis = Nodebatis({
    client: 'mysql',
    connection: {
        host: '127.0.0.1',
        user: 'root',
        password: '123456',
        database: 'ry'
    },
    pool: { min: 0, max: 7 },
    showSQL: true,
    prodMode: false
})

// nodebatis.genMapperXML()
nodebatis.initFromFiles(['./TestMapper.xml']);
// nodebatis.initFromDirs(['../RuoYi/ruoyi-system/src/main/resources/mapper/system']);



async function testTrx() {
    const trx = await nodebatis.startTrx()
    try {
        await nodebatis.execute('TestMapper', 'updateTest', { id: 7, amount: -100 }, trx)
        console.log('reached here');
        throw new Error('lalala')
        await nodebatis.execute('TestMapper', 'updateTest', { id: 1, amount: 100 }, trx)
        await trx.commit()
    } catch (error) {
        await trx.rollback()
        throw new Error('Transaction has been rollbacked due to execution failure')
    }
}
testTrx()
