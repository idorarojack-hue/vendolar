import React from 'react';
import { TContractParams } from '@/services/vindolar/contracts';
import { buyContract, isLoggedInForTrading, sellContract, TOpenContract, watchContract } from '@/services/vindolar/trading';
import { localize } from '@deriv-com/translations';
import { isClosed, TPosition } from '../pages/manual-trader/positions';

/**
 * Buy contracts and follow them live until they close. Positions are kept for the page's lifetime.
 * `buy` can place several contracts at once (each its own contract on Deriv).
 */
export const usePositions = () => {
    const [positions, setPositions] = React.useState<TPosition[]>([]);
    const [is_buying, setIsBuying] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const watchers = React.useRef(new Map<number, () => void>());

    React.useEffect(() => {
        const current = watchers.current;
        return () => current.forEach(stop => stop());
    }, []);

    const update = React.useCallback((contract_id: number, patch: Partial<TPosition>) => {
        setPositions(list => list.map(p => (p.contract_id === contract_id ? { ...p, ...patch } : p)));
    }, []);

    const follow = React.useCallback(
        (contract_id: number) => {
            const stop = watchContract(contract_id, (contract: TOpenContract) => {
                update(contract_id, {
                    ...contract,
                    contract_id,
                    buy_price: Number(contract.buy_price),
                    profit: contract.profit === undefined ? undefined : Number(contract.profit),
                });
                if (isClosed(contract)) {
                    watchers.current.get(contract_id)?.();
                    watchers.current.delete(contract_id);
                }
            });
            watchers.current.set(contract_id, stop);
        },
        [update]
    );

    /** Buy one or more contracts (e.g. both legs of a hedge, or N copies). Returns how many succeeded. */
    const buy = React.useCallback(
        async (orders: { params: TContractParams; market_name: string }[]) => {
            setError(null);
            if (!isLoggedInForTrading()) {
                setError(localize('Please log in to trade.'));
                return 0;
            }
            setIsBuying(true);
            const results = await Promise.allSettled(orders.map(order => buyContract(order.params)));
            const added: TPosition[] = [];
            const failures: string[] = [];
            results.forEach((result, i) => {
                const { params, market_name } = orders[i];
                if (result.status === 'fulfilled') {
                    added.push({
                        contract_id: result.value.contract_id,
                        contract_type: params.contract_type,
                        buy_price: Number(result.value.buy_price),
                        payout: Number(result.value.payout),
                        status: 'open',
                        barrier: params.digit === undefined ? undefined : String(params.digit),
                        market_name,
                    });
                } else {
                    failures.push(result.reason?.message ?? localize('A trade could not be placed.'));
                }
            });
            setPositions(list => [...added, ...list]);
            added.forEach(p => follow(p.contract_id));
            if (failures.length) setError([...new Set(failures)].join(' '));
            setIsBuying(false);
            return added.length;
        },
        [follow]
    );

    const sell = React.useCallback(
        async (contract_id: number) => {
            update(contract_id, { is_selling: true });
            try {
                await sellContract(contract_id);
            } catch (e: any) {
                setError(e?.message ?? localize('The contract could not be sold.'));
            } finally {
                update(contract_id, { is_selling: false });
            }
        },
        [update]
    );

    return { positions, buy, sell, is_buying, error, setError };
};
